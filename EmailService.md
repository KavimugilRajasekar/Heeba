# Heeba Email Service Documentation

This document provides a detailed overview of how Heeba handles email operations, including advanced filtering, caching, threading, and LLM-driven summaries.

## 1. Core Architecture

Heeba uses a combination of IMAP and SMTP protocols to interact with email servers.

- **IMAP (Internet Message Access Protocol)**: Used for fetching the inbox list and reading individual email contents.
- **SMTP (Simple Mail Transfer Protocol)**: Used for sending emails.

### Dependencies
- `imapflow`: High-level IMAP client for Node.js.
- `mailparser`: Advanced parser for email messages (handles MIME, attachments, etc.).
- `nodemailer`: The standard library for sending emails in Node.js.
- `html-to-text`: Converts HTML email bodies into clean, readable plain text for the terminal.

## 2. Configuration (`credentials.json`)

Email credentials must be configured in the `credentials.json` file at the root of the project.

## 3. Advanced Email Operations

### 3.1 Intelligent Fetching
Heeba now supports natural language filtering using IMAP SEARCH.
- **By Date**: `Emails from yesterday`, `Emails on 2026-04-02`.
- **By Time Range**: `Morning emails`, `Today afternoon`.
  - Morning: 05:00 - 12:00
  - Afternoon: 12:00 - 17:00
  - Evening: 17:00 - 21:00
  - Night: 21:00 - 05:00
- **By Filter**: `Search mail from Amazon`, `Find invoices`.
- **Unread Only**: `What did I miss yesterday?`.

### 3.2 Caching Layer
To improve performance and reduce server load, Heeba caches email lists locally in `.cache/email/`.
- Cache is keyed by date (`YYYY-MM-DD.json`).
- If a cache exists for a date, Heeba will use it instead of connecting to IMAP (unless a refresh is requested).

### 3.3 Threading
Heeba can group emails from a specific sender into logical threads.
- Uses `Message-ID` and `In-Reply-To` headers for grouping.
- Visualizes threads as a tree structure in the terminal.

### 3.4 Exporting
You can save your emails to local files in the `exports/` directory.
- Supported formats: Markdown (`.md`) and Plain Text (`.txt`).
- Command: `Export yesterday's emails to markdown`.

### 3.5 LLM Summarization
Heeba can provide a categorized daily summary of your emails using the local LLM.
- **Categories**: Important, Promotional, Alerts, Personal.
- Command: `Summarize today's emails`.
- **Implementation**: Fetches the first 10 emails of the day and passes them to the LLM for analysis.

## 4. UI Formats

### Table View (Primary)
For all email lists (fetches, search results, unread messages, etc.), Heeba uses a cyan-bordered table for maximum clarity and professional appearance:

```table
┌────┬────────────┬─────────────┬──────────────┐
│ #  │ Date       │ From        │ Subject      │
├────┼────────────┼─────────────┼──────────────┤
│ 1  │ 2026-02-10 │ Amazon      │ Your order.. │
└────┴────────────┴─────────────┴──────────────┘
```

### Metadata View
When reading a specific email, Heeba extracts key headers and displays them in a focused layout before the body content.

## 5. Security & Safety
- All connections are established over **SSL/TLS**.
- Local cache stores metadata for faster rendering.
- Summarization uses your local LLM (no external data sharing).
