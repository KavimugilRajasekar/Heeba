const { parseCommandFromResponse } = require('../utils/json-parser');

/**
 * Generic Recursive Agent Loop
 * Handles any user prompt by allowing the LLM to call tools,
 * seeing the results, and continuing until it reaches a text-only conclusion.
 * 
 * @param {string} userInput - The original user prompt
 * @param {Function} queryFn - Function to query the LLM: (prompt, mode, history) => Promise<string>
 * @param {Object} commandHandlers - Map of action names to handler functions
 * @param {Object} options - Configuration options
 */
async function runAgenticLoop(userInput, queryFn, commandHandlers, options = {}) {
  const { 
    maxIterations = 15, 
    onStep = null, 
    isTUI = false, 
    context = {} 
  } = options;

  const history = []; // Internal history for the recursive loop
  let iteration = 0;
  let finalResponse = '';
  let lastResult = null;
  let plan = [];
  let currentStepIndex = 0;

  // Signal the start of the loop
  if (onStep) onStep({ phase: 'start', userInput });

  // === PHASE 1: PLANNING ===
  try {
    if (onStep) onStep({ phase: 'planning' });

    // Build a list of available actions for the planner
    const availableActions = Object.keys(commandHandlers).join(', ');

    const planningPrompt = `You are a strategic planner. Analyze the user request and create a step-by-step plan using the available tools.
USER REQUEST: "${userInput}"

AVAILABLE TOOLS: ${availableActions}

Your response MUST be a JSON object containing a "plan" key which is an array of strings. Each string should be a clear, tactical step that uses one of the available tools.
Format: { "plan": ["Step 1", "Step 2", ...] }`;

    const planResponse = await queryFn(planningPrompt, 'auto');
    const parsedPlan = parseCommandFromResponse(planResponse);
    
    if (parsedPlan && Array.isArray(parsedPlan.plan)) {
      plan = parsedPlan.plan;
      if (onStep) onStep({ phase: 'plan_ready', plan });
    }
  } catch (err) {
    if (onStep) onStep({ phase: 'error', message: `Planning failed: ${err.message}` });
    // Continue without a plan if planning fails
  }

  while (iteration < maxIterations) {
    iteration++;

    // Construct the prompt for this iteration
    let currentPrompt = userInput;
    
    // Build available actions for this iteration
    const availableActions = Object.keys(commandHandlers).join(', ');

    if (plan.length > 0) {
      currentPrompt = `USER REQUEST: ${userInput}\n\n`;
      currentPrompt += `AVAILABLE TOOLS: ${availableActions}\n\n`;
      currentPrompt += `STRATEGIC PLAN:\n`;
      plan.forEach((step, idx) => {
        const marker = idx === currentStepIndex ? '➤ ' : (idx < currentStepIndex ? '✔ ' : '  ');
        currentPrompt += `${marker}Step ${idx + 1}: ${step}\n`;
      });
      currentPrompt += `\nCURRENT STEP: ${currentStepIndex + 1} of ${plan.length}\n\n`;
    }

    if (history.length > 0) {
      if (plan.length === 0) currentPrompt = `USER REQUEST: ${userInput}\n\n`;
      currentPrompt += `PREVIOUS ACTIONS AND RESULTS:\n`;
      history.forEach((h, i) => {
        currentPrompt += `Step ${i + 1}:\nAction: ${h.action}\nResult: ${h.result}\n\n`;
      });
      // If all planned steps are done, ask for final summary
      if (currentStepIndex >= plan.length) {
        currentPrompt += `All planned steps have been executed. Please provide a clear, friendly summary of the results to the user. Do NOT call any more tools.`;
      } else {
        currentPrompt += `Based on the latest results and the current step in your plan, provide your next action or final response to the user.`;
      }
    } else if (plan.length > 0) {
      currentPrompt += `Execute the first step of the plan.`;
    }

    if (onStep) onStep({ phase: 'thinking', iteration, currentStep: currentStepIndex + 1 });

    // Query the LLM
    const llmResponse = await queryFn(currentPrompt, 'auto');
    
    // Check if the response contains a JSON command (with action field)
    const command = parseCommandFromResponse(llmResponse);

    // Skip plans or empty commands - treat as final response
    // A valid command must have either an 'action' or 'command' field
    if (!command || (!command.action && !command.command)) {
      finalResponse = llmResponse;
      break;
    }

    // Ignore plan-only responses (LLM returned {"plan": [...]} instead of executing)
    if (command && command.plan && !command.action) {
      // Extract the first step and try to parse it as an action
      const firstStep = command.plan[0] || '';

      // Try to detect "Use <action> with ..." pattern
      const useMatch = firstStep.match(/^Use\s+(\w+)\s+with/i);
      const doMatch = firstStep.match(/^Do\s+(\w+)/i);
      const actionMatch = firstStep.match(/^(\w+)\s+/);
      const detectedAction = useMatch?.[1] || doMatch?.[1] || actionMatch?.[1];

      if (detectedAction && commandHandlers[detectedAction]) {
        // Extract parameters from the step text
        const pathMatch = firstStep.match(/path["\s:]+"?([^"]+)"?/i) ||
                          firstStep.match(/command["\s:]+"?([^"]+)"?/i) ||
                          firstStep.match(/file_path["\s:]+"?([^"]+)"?/i);
        const paramValue = pathMatch?.[1]?.trim();

        if (paramValue) {
          // Directly execute the detected action
          command.action = detectedAction;
          command.parameters = detectedAction === 'run_command'
            ? { command: paramValue }
            : { path: paramValue };
        }
      }

      // If still no valid action, ask LLM to retry
      if (!command.action || !commandHandlers[command.action]) {
        const retryPrompt = `You returned a plan instead of executing it. Please execute the first step of your plan now.
YOUR PLAN: ${JSON.stringify(command.plan)}

Available tools: ${Object.keys(commandHandlers).join(', ')}

Respond ONLY with a JSON object like: {"action": "run_command", "parameters": {"command": "git branch -r"}}`;
        const retryResponse = await queryFn(retryPrompt, 'auto');
        const retryCommand = parseCommandFromResponse(retryResponse);
        if (!retryCommand || (!retryCommand.action && !retryCommand.command)) {
          finalResponse = retryResponse;
          break;
        }
        Object.assign(command, retryCommand);
      }
    }

    if (command && (command.action || command.command)) {
      // Execute the command
      if (onStep) onStep({
        phase: 'executing',
        iteration,
        action: command.action,
        parameters: command.parameters || command.payload,
        stepTitle: plan[currentStepIndex] || 'General Action'
      });

      let result;
      try {
        const handler = commandHandlers[command.action];
        if (handler) {
          result = await handler(command.parameters || command.payload || {}, context);
        } else {
          result = { success: false, message: `Unknown action: ${command.action}` };
        }
      } catch (err) {
        result = { success: false, message: `Execution error: ${err.message}` };
      }

      const resultStr = result.message || JSON.stringify(result);

      // Store in history for the next iteration
      history.push({
        action: command.action,
        parameters: command.parameters || command.payload,
        result: resultStr
      });

      // If successful, we consider the current step progressed
      if (result.success && currentStepIndex < plan.length) {
        currentStepIndex++;
      }

      if (onStep) onStep({ 
        phase: 'result', 
        iteration, 
        result: resultStr, 
        success: result.success,
        nextStepIndex: currentStepIndex
      });
      
      // Update last result
      lastResult = result;
      
    } else {
      // No command found, this is the final response
      finalResponse = llmResponse;
      break;
    }
  }

  // If we hit the iteration limit without a clean text response
  if (!finalResponse && iteration >= maxIterations) {
    finalResponse = `Agent reached maximum iteration limit (${maxIterations}).\nLast result was: ${lastResult?.message || 'N/A'}`;
  }

  if (onStep) onStep({ phase: 'conclusion', finalResponse });

  return {
    finalResponse,
    iterations: iteration,
    history
  };
}

module.exports = { runAgenticLoop };
