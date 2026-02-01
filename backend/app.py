"""
RAG Document Assistant - Production Backend
Built with FastAPI, ChromaDB, and OpenAI
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
from chromadb.config import Settings
from openai import OpenAI
import os
from typing import List
import PyPDF2
import io
import hashlib
from datetime import datetime
import logging
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="RAG Document Assistant API",
    description="Intelligent document Q&A using Retrieval-Augmented Generation",
    version="1.0.0"
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# Create or get collection
try:
    collection = chroma_client.get_collection(name="documents")
except:
    collection = chroma_client.create_collection(
        name="documents",
        metadata={"hnsw:space": "cosine"}
    )

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = OpenAI(api_key=OPENAI_API_KEY)

# Pydantic models
class QueryRequest(BaseModel):
    question: str
    top_k: int = 3

class QueryResponse(BaseModel):
    answer: str
    sources: List[dict]
    confidence: float
    latency_ms: float

class DocumentInfo(BaseModel):
    id: str
    filename: str
    upload_time: str
    chunk_count: int

# Utility functions
def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from PDF bytes"""
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        logger.error(f"Error extracting PDF text: {e}")
        raise HTTPException(status_code=400, detail="Failed to extract text from PDF")

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks"""
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]

        # Try to break at sentence boundary
        if end < text_length:
            last_period = chunk.rfind('.')
            if last_period > chunk_size * 0.5:
                chunk = chunk[:last_period + 1]
                end = start + last_period + 1

        chunks.append(chunk.strip())
        start = end - overlap

    return [c for c in chunks if len(c.strip()) > 50]

def generate_doc_id(filename: str, content: bytes) -> str:
    """Generate unique document ID"""
    hash_content = hashlib.md5(content).hexdigest()
    return f"{filename}_{hash_content[:8]}"

# API Endpoints
@app.get("/")
async def root():
    return {"message": "RAG Document Assistant API", "version": "1.0.0", "status": "operational"}

@app.post("/upload", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a document"""
    start_time = datetime.now()

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        content = await file.read()
        doc_id = generate_doc_id(file.filename, content)
        logger.info(f"Extracting text from {file.filename}")
        text = extract_text_from_pdf(content)

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text found in PDF")

        logger.info(f"Chunking text from {file.filename}")
        chunks = chunk_text(text)

        logger.info(f"Storing {len(chunks)} chunks in database")
        collection.add(
            documents=chunks,
            ids=[f"{doc_id}_chunk_{i}" for i in range(len(chunks))],
            metadatas=[{
                "filename": file.filename,
                "doc_id": doc_id,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "upload_time": datetime.now().isoformat()
            } for i in range(len(chunks))]
        )

        elapsed = (datetime.now() - start_time).total_seconds() * 1000
        logger.info(f"Document processed in {elapsed:.2f}ms")

        return DocumentInfo(
            id=doc_id,
            filename=file.filename,
            upload_time=datetime.now().isoformat(),
            chunk_count=len(chunks),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """Query documents using RAG"""
    start_time = datetime.now()

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key not configured. Set OPENAI_API_KEY environment variable.",
        )

    try:
        logger.info(f"Searching for: {request.question}")
        results = collection.query(query_texts=[request.question], n_results=request.top_k)

        if not results['documents'][0]:
            return QueryResponse(
                answer="I couldn't find any relevant information in the uploaded documents.",
                sources=[],
                confidence=0.0,
                latency_ms=(datetime.now() - start_time).total_seconds() * 1000,
            )

        context_chunks = results['documents'][0]
        sources = []
        for i, (chunk, metadata, distance) in enumerate(
            zip(context_chunks, results['metadatas'][0], results['distances'][0])
        ):
            sources.append({
                "chunk": chunk[:200] + "..." if len(chunk) > 200 else chunk,
                "filename": metadata.get("filename", "Unknown"),
                "relevance": float(1 - distance),
            })

        context = "\n\n".join([f"[Source {i+1}]: {chunk}" for i, chunk in enumerate(context_chunks)])

        logger.info("Generating answer with GPT")
        system_prompt = """You are a helpful AI assistant that answers questions based on provided document excerpts.

Rules:
- Only use information from the provided sources
- If the sources don't contain enough information, say so clearly
- Cite which source(s) you're using (e.g., "According to Source 1...")
- Be concise but thorough
- If asked about something not in the sources, acknowledge the limitation"""

        user_prompt = f"""Context from documents:

{context}

Question: {request.question}

Please provide a clear, accurate answer based on the context above."""

        # ✅ New OpenAI v1 API call
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=500,
        )

        answer = response.choices[0].message.content

        avg_relevance = sum(s["relevance"] for s in sources) / len(sources)
        confidence = min(avg_relevance * 1.2, 1.0)

        elapsed = (datetime.now() - start_time).total_seconds() * 1000
        logger.info(f"Query completed in {elapsed:.2f}ms")

        return QueryResponse(
            answer=answer,
            sources=sources,
            confidence=confidence,
            latency_ms=elapsed,
        )

    except Exception as e:
        logger.error(f"Error querying documents: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to query documents: {str(e)}")

@app.get("/documents", response_model=List[DocumentInfo])
async def list_documents():
    """List all uploaded documents"""
    try:
        all_data = collection.get()
        docs = {}
        for metadata in all_data['metadatas']:
            doc_id = metadata.get("doc_id")
            if doc_id not in docs:
                docs[doc_id] = {
                    "id": doc_id,
                    "filename": metadata.get("filename"),
                    "upload_time": metadata.get("upload_time"),
                    "chunk_count": 0,
                }
            docs[doc_id]["chunk_count"] += 1
        return list(docs.values())
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list documents")

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and all its chunks"""
    try:
        results = collection.get(where={"doc_id": doc_id})

        if not results['ids']:
            raise HTTPException(status_code=404, detail="Document not found")

        collection.delete(ids=results['ids'])
        return {"message": f"Deleted document {doc_id} and {len(results['ids'])} chunks"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete document")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "openai_configured": bool(OPENAI_API_KEY),
        "documents_count": len(collection.get()['ids']),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
