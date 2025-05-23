# JS LangChain Agent

# Created for AI workshop in UOSA

# Author: Moiz Khan

A simple but practical RAG and agentic system that demonstrates the use of LangChain with Azure OpenAI and Cohere for web search, knowledge base queries, and CGPA calculations.

## Installation

Clone this repository, then install the dependencies:

```bash
npm install
```

This will install all required packages:

- @langchain/cohere
- @langchain/community
- @langchain/openai
- axios
- dotenv
- express
- langchain

## Setup

1. Create a `.env` file in the root directory based on the `.env.template` file
2. Add your API keys:
   - Azure OpenAI API key
   - Cohere API key
   - Serper.dev API key (for web search)

## Running the Application

Start the server:

```bash
node server.js
```

The application will be available at http://localhost:3000

## Features

- RAG (Retrieval-Augmented Generation) with vector search
- Web search capability
- Toggle between agent mode and RAG-only mode
- Natural language CGPA calculation
- Token usage tracking

## Architecture

- Frontend: HTML, CSS (TailwindCSS), vanilla JavaScript
- Backend: Node.js, Express
- AI: LangChain with Azure OpenAI and Cohere
