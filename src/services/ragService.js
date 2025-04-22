import * as dotenv from "dotenv";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AzureChatOpenAI } from "@langchain/openai";
import { CohereEmbeddings } from "@langchain/cohere";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import axios from "axios";

dotenv.config();

class RAGService {
  constructor() {
    this.initializeEnv();
    this.initializeModels();
  }

  initializeEnv() {
    const requiredEnvVars = {
      AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
      AZURE_OPENAI_API_INSTANCE_NAME:
        process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      AZURE_OPENAI_API_CHAT_DEPLOYMENT_NAME:
        process.env.AZURE_OPENAI_API_CHAT_DEPLOYMENT_NAME,
      AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,
      COHERE_API_KEY: process.env.COHERE_API_KEY,
      SERPER_API_KEY: process.env.SERPER_API_KEY,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}\n` +
          "Please check your .env file and ensure all variables are set."
      );
    }
  }

  async initializeModels() {
    this.llm = new AzureChatOpenAI({
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_API_CHAT_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
      temperature: 0.3,
    });

    this.embeddings = new CohereEmbeddings({
      apiKey: process.env.COHERE_API_KEY,
      model: "embed-english-v3.0",
    });

    await this.setupVectorStore();
  }

  // in mem vector store
  async setupVectorStore() {
    const loader = new TextLoader("./data/widget-faq.txt");
    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 400,
      chunkOverlap: 40,
    });
    const splitDocs = await textSplitter.splitDocuments(docs);
    this.vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      this.embeddings
    );
  }

  // web search tool
  async webSearch(query) {
    try {
      const response = await axios.post(
        "https://google.serper.dev/search",
        {
          q: query,
          num: 5,
        },
        {
          headers: {
            "X-API-KEY": process.env.SERPER_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      const organicResults = response.data.organic || [];
      const results = organicResults.map((result) => ({
        title: result.title,
        snippet: result.snippet,
        link: result.link,
      }));

      return results;
    } catch (error) {
      console.error("Web search error:", error.message);
      return [];
    }
  }

  async query(question, mode = "agent") {
    // check if its a web-search tool call
    const needsWebSearch = this.shouldUseWebSearch(question);
    let webResults = [];

    // check if its a gpa calc tool call
    const isCgpaRequest = this.isCgpaCalculationRequest(question);

    if (needsWebSearch && mode === "agent") {
      webResults = await this.webSearch(question);
      console.log("Web search results:", webResults);
    }

    if (isCgpaRequest && mode === "agent") {
      return this.handleCgpaRequest(question);
    }

    // if we have web results, we need to summarize them and use it as LLM context
    let webContext = "";
    if (webResults.length > 0 && mode === "agent") {
      // summarize multiple web search results
      const webResultsText = webResults
        .map((result, i) => `[${i + 1}] ${result.title}: ${result.snippet}`)
        .join("\n");

      const webSummaryPrompt = `
        Below are web search results for the query: "${question}"
        
        ${webResultsText}
        
        Based only on these search results, provide a concise summary of the key facts 
        that directly answer the query. If the results don't contain relevant information,
        state that clearly.
      `;

      try {
        const webSummaryResponse = await this.llm.invoke(webSummaryPrompt);
        webContext = `Web search summary: ${webSummaryResponse.content}`;
        console.log("Web context generated:", webContext);
      } catch (error) {
        console.error("Error generating web context:", error);
      }
    }

    const retriever = this.vectorStore.asRetriever(3);

    let promptTemplate;

    if (mode === "agent") {
      promptTemplate = `
        You are an AI assistant with access to both knowledge base and web search capabilities.
        
        Answer the following question using the provided information.
        
        If the answer can be found in the context, use that information.
        ${
          webResults.length > 0
            ? `
        The web search results for this query show:
        ${webResults
          .map((result, i) => `[${i + 1}] ${result.title}: ${result.snippet}`)
          .join("\n")}
        
        ${webContext ? `Summary of web search: ${webContext}` : ""}
        
        IMPORTANT: Look carefully at these web search results and use them as your primary source if they directly answer the question.
        `
            : "If the information is not in the context, say you don't know."
        }
        
        Context from knowledge base: {context}
        
        Question: {input}
        
        Answer the question fully and comprehensively based on all available information. 
        If web search results are available and relevant, prioritize that information and cite it specifically.
      `;
    } else {
      // RAG mode - only use knowledge base
      promptTemplate = `
        Answer the following question based solely on the provided context.
        If the answer is not in the context, simply state that you don't have that information.
        
        Context: {context}
        
        Question: {input}
        
        Answer:
      `;
    }

    // preparing pre-prompt
    const prompt = ChatPromptTemplate.fromTemplate(promptTemplate);

    // chain1: takes question
    const documentChain = await createStuffDocumentsChain({
      llm: this.llm,
      prompt: prompt,
    });

    // chain2: takes question and context
    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever: retriever,
    });

    // chain3: invoke the chain
    const result = await retrievalChain.invoke({
      input: question,
    });

    // estimating token usage
    const usage = {
      completion_tokens: result.answer.length / 4,
      prompt_tokens:
        question.length / 4 + (result.context ? result.context.length / 4 : 0),
      total_tokens: 0,
    };

    usage.total_tokens = usage.completion_tokens + usage.prompt_tokens;

    return {
      answer: result.answer,
      context: result.context,
      usage: result.usage || usage,
      webResults: webResults.length > 0 ? webResults : null,
      mode: mode,
    };
  }

  isCgpaCalculationRequest(question) {
    const cgpaKeywords = [
      "cgpa",
      "gpa",
      "grade point",
      "calculate my grade",
      "compute grade",
      "grade average",
      "course grade",
    ];

    return cgpaKeywords.some((keyword) =>
      question.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async handleCgpaRequest(question) {
    // Extract grade information from the question using the LLM
    const extractionPrompt = `
      Extract grade information from the following question. 
      Return a JSON array of objects, each with 'credits' and 'points' properties.
      If the information is ambiguous or incomplete, return an empty array.
      
      Question: ${question}
      
      JSON Response:
    `;

    try {
      const extraction = await this.llm.invoke(extractionPrompt);
      let grades = [];

      try {
        // Try to parse the JSON response
        const responseText = extraction.content;
        const jsonStart = responseText.indexOf("[");
        const jsonEnd = responseText.lastIndexOf("]") + 1;

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonStr = responseText.substring(jsonStart, jsonEnd);
          grades = JSON.parse(jsonStr);
        }
      } catch (error) {
        console.error("Error parsing grades JSON:", error);
      }

      if (grades.length > 0) {
        // Calculate CGPA
        const total = grades.reduce(
          (acc, grade) => acc + grade.points * grade.credits,
          0
        );
        const totalCredits = grades.reduce(
          (acc, grade) => acc + grade.credits,
          0
        );
        const cgpa = total / totalCredits;

        return {
          answer: `Based on the grades you provided, your CGPA is ${cgpa.toFixed(
            2
          )}.`,
          usage: {
            completion_tokens: 20,
            prompt_tokens: question.length / 4,
            total_tokens: 20 + question.length / 4,
          },
          mode: "agent",
        };
      } else {
        // Not enough info to calculate CGPA
        return {
          answer: `I can calculate your CGPA, but I need more specific information about your courses, credits, and grades. Please provide this information in your question.`,
          usage: {
            completion_tokens: 30,
            prompt_tokens: question.length / 4,
            total_tokens: 30 + question.length / 4,
          },
          mode: "agent",
        };
      }
    } catch (error) {
      console.error("CGPA calculation error:", error);
      return {
        answer: `I encountered an error trying to calculate your CGPA. Please try asking in a different way.`,
        usage: {
          completion_tokens: 20,
          prompt_tokens: question.length / 4,
          total_tokens: 20 + question.length / 4,
        },
        mode: "agent",
      };
    }
  }

  shouldUseWebSearch(question) {
    const webSearchTriggers = [
      "current",
      "latest",
      "recent",
      "news",
      "today",
      "search",
      "find online",
      "look up",
      "web",
      "internet",
    ];

    return webSearchTriggers.some((trigger) =>
      question.toLowerCase().includes(trigger.toLowerCase())
    );
  }
}

export default new RAGService();
