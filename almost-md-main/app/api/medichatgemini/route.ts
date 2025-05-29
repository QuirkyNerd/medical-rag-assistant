import { queryPineconeVectorStore } from "@/utils";
import { Pinecone } from "@pinecone-database/pinecone";
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Message, StreamData, streamText } from "ai";

// Configuration
export const maxDuration = 60;
const DEFAULT_MODEL = "models/gemini-1.5-pro-latest";

// Initialize clients with fallback API keys for development
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY || "pcsk_2iT7TQ_AxTpK4FN1fGXCysKevJSo7R3e8jr3jAYZH7Czh47PDyeLjWH28qnow3HPJqsvJQ",
});

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || 
            process.env.GEMINI_API_KEY || 
            "AIzaSyDAtKRI1Q6jxgtPXi0WrfebRrTuSV-_RGU" // Fallback for testing
});

const model = google(DEFAULT_MODEL, {
    safetySettings: [
        { 
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT', 
            threshold: 'BLOCK_NONE' 
        }
    ],
});

export async function POST(req: Request) {
    try {
        const reqBody = await req.json();
        console.log("Request received:", JSON.stringify(reqBody, null, 2));

        const messages: Message[] = reqBody.messages;
        const userQuestion = messages[messages.length - 1].content;
        const reportData: string = reqBody.data?.reportData || "";

        // Enhanced query construction
        const query = `Patient medical context: ${reportData}\n\nUser question: ${userQuestion}\n\nFind relevant medical information:`;

        // Query Pinecone with error handling
        let retrievals = [];
        try {
            retrievals = await queryPineconeVectorStore(pinecone, 'medic', "ns1", query);
            console.log("Retrieved documents:", retrievals.length);
        } catch (pineconeError) {
            console.error("Pinecone query failed:", pineconeError);
            retrievals = ["Could not retrieve medical references"];
        }

        // Ensure retrievals is always an array
        retrievals = Array.isArray(retrievals) ? retrievals : [retrievals];

        // Structured prompt template
        const finalPrompt = `**Medical Consultation System**\n
### Patient Report Summary:
${reportData || "No report provided"}

### User Question:
${userQuestion}

### Relevant Medical Knowledge:
${retrievals.length > 0 ? retrievals.join("\n- ") : "No additional references found"}

### Instructions:
1. Analyze the patient report carefully
2. Incorporate ONLY relevant findings from medical knowledge
3. Provide a detailed, clinically accurate response
4. Cite sources when applicable
5. If unsure, state limitations clearly

### Response:
`;

        // Stream setup with proper cleanup
        const data = new StreamData();
        const result = await streamText({
            model,
            prompt: finalPrompt,
        });

        // Convert to stream response
        const stream = result.toAIStream({
            onFinal: () => {
                console.log("Stream completed");
                data.close();
            },
            onError: (error) => {
                console.error("Stream error:", error);
                data.close();
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Stream-Data": "true",
            },
        });

    } catch (error) {
        console.error("API processing error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
                timestamp: new Date().toISOString()
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "X-Error": "true"
                },
            }
        );
    }
}
