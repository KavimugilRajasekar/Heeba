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
    maxIterations = 5, 
    onStep = null, 
    isTUI = false, 
    context = {} 
  } = options;

  const history = []; // Internal history for the recursive loop
  let iteration = 0;
  let finalResponse = '';
  let lastResult = null;

  // Signal the start of the loop
  if (onStep) onStep({ phase: 'start', userInput });

  while (iteration < maxIterations) {
    iteration++;

    // Construct the prompt for this iteration
    // If it's the first iteration, just use the input. 
    // Otherwise, we provide the history of actions and results.
    let currentPrompt = userInput;
    if (history.length > 0) {
      currentPrompt = `USER REQUEST: ${userInput}\n\n`;
      currentPrompt += `PREVIOUS ACTIONS AND RESULTS:\n`;
      history.forEach((h, i) => {
        currentPrompt += `Step ${i+1}:\nAction: ${h.action}\nResult: ${h.result}\n\n`;
      });
      currentPrompt += `Based on the above results, provide your next action or final response to the user.`;
    }

    if (onStep) onStep({ phase: 'thinking', iteration });

    // Query the LLM
    const llmResponse = await queryFn(currentPrompt, 'auto');
    
    // Check if the response contains a JSON command
    const command = parseCommandFromResponse(llmResponse);

    if (command && command.action) {
      // Execute the command
      if (onStep) onStep({ phase: 'executing', iteration, action: command.action, parameters: command.parameters || command.payload });

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

      if (onStep) onStep({ phase: 'result', iteration, result: resultStr, success: result.success });
      
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
