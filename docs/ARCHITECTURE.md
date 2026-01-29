# System Architecture

## Overview

The RAG Document Assistant is a microservices-based application that combines document processing, vector search, and large language models to enable intelligent question-answering over uploaded documents.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│                    (React + Tailwind)                       │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │  Upload  │  │  Query   │  │ Results  │                │
│  │Component │  │Component │  │Component │                │
│  └──────────┘  └──────────┘  └──────────┘                │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API
                     │ (JSON)
┌────────────────────▼────────────────────────────────────────┐
│                      Backend API                            │
│                    (FastAPI + Python)                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │             Request Handlers                        │  │
│  │  /upload  /query  /documents  /health              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Document   │  │   Vector     │  │     LLM      │   │
│  │  Processing  │  │   Search     │  │  Integration │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────────────┬────────────────────┬─────────────────┘
                     │                    │
         ┌───────────▼──────────┐    ┌───▼────────────┐
         │     ChromaDB         │    │  OpenAI API    │
         │  (Vector Database)   │    │   (GPT-3.5)    │
         └──────────────────────┘    └────────────────┘
```

## Component Details

### 1. Frontend (React)

**Purpose**: User interface for document management and querying

**Key Features**:
- Document upload with drag-and-drop
- Real-time query submission
- Answer display with source citations
- Performance metrics visualization

**Technology Stack**:
- React 18 with Hooks
- Tailwind CSS for styling
- Lucide React for icons
- Vite for bundling

**State Management**:
- Local state with `useState`
- API calls with fetch API
- No external state library needed

### 2. Backend API (FastAPI)

**Purpose**: Orchestrate document processing and query handling

**Endpoints**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Root endpoint |
| POST | `/upload` | Upload PDF document |
| POST | `/query` | Query documents |
| GET | `/documents` | List all documents |
| DELETE | `/documents/{id}` | Delete document |
| GET | `/health` | Health check |

**Key Responsibilities**:
- Request validation (Pydantic models)
- PDF text extraction
- Text chunking with overlap
- Vector storage coordination
- LLM prompt construction
- Response formatting

**Error Handling**:
- HTTP exception handling
- Structured error responses
- Logging for debugging

### 3. Document Processing Pipeline

```
PDF Upload
    ↓
Text Extraction (PyPDF2)
    ↓
Text Chunking
    │
    ├─ Chunk Size: 1000 chars
    ├─ Overlap: 200 chars
    └─ Boundary Detection: Sentence-aware
    ↓
Embedding Generation (OpenAI)
    ↓
Vector Storage (ChromaDB)
```

**Chunking Strategy**:
- Fixed size with overlap prevents context loss
- Sentence boundary detection maintains coherence
- Chunk size balances granularity vs context

**Trade-offs**:
- Larger chunks: More context, less precise
- Smaller chunks: More precise, less context
- Overlap: Prevents information split at boundaries

### 4. Vector Search (ChromaDB)

**Purpose**: Semantic search over document chunks

**How it Works**:
1. Query text → Embedding (OpenAI ada-002)
2. Cosine similarity search in vector space
3. Return top-K most similar chunks

**Configuration**:
- Distance metric: Cosine similarity
- Storage: DuckDB + Parquet (persistent)
- Index: HNSW (Hierarchical Navigable Small World)

**Performance**:
- Sub-100ms search for 1000s of chunks
- Linear scaling with document count
- In-memory operation after initial load

### 5. RAG Implementation

**Retrieval-Augmented Generation Flow**:

```python
# 1. Retrieve relevant context
relevant_chunks = vector_db.search(query, top_k=3)

# 2. Construct prompt with context
prompt = f"""
Context: {relevant_chunks}
Question: {query}
Answer based on context above.
"""

# 3. Generate answer
answer = llm.generate(prompt)

# 4. Return with sources
return {
    "answer": answer,
    "sources": relevant_chunks
}
```

**Why RAG?**:
- ✅ No fine-tuning needed
- ✅ Dynamic knowledge updates
- ✅ Cost-effective
- ✅ Source attribution
- ❌ Requires good retrieval
- ❌ Context window limits

### 6. LLM Integration (OpenAI)

**Model**: GPT-3.5-turbo

**Configuration**:
- Temperature: 0.3 (focused responses)
- Max tokens: 500 (concise answers)
- System prompt defines behavior

**System Prompt Design**:
```
You are a helpful assistant that answers questions 
based on provided documents.

Rules:
- Only use information from sources
- Cite sources in answers
- Acknowledge limitations
- Be concise but thorough
```

**Cost Optimization**:
- Cache frequent queries
- Limit max tokens
- Use cheaper model (3.5 vs 4)
- Batch requests when possible

## Data Flow

### Document Upload Flow

```
1. User uploads PDF
2. Frontend: POST /upload with FormData
3. Backend receives file
4. Extract text from PDF
5. Split into chunks (1000 chars, 200 overlap)
6. Generate embeddings for each chunk
7. Store in ChromaDB with metadata
8. Return document info to frontend
9. Frontend updates document list
```

### Query Flow

```
1. User types question
2. Frontend: POST /query with JSON
3. Backend receives query
4. Generate query embedding
5. Search ChromaDB for top-3 similar chunks
6. Construct prompt with chunks + question
7. Call OpenAI API
8. Parse response
9. Calculate confidence score
10. Return answer + sources + metrics
11. Frontend displays results
```

## Database Schema

### ChromaDB Collections

**Collection**: `documents`

**Document Structure**:
```json
{
  "id": "filename_hash123_chunk_0",
  "document": "Actual text chunk content...",
  "embedding": [0.123, -0.456, ...],
  "metadata": {
    "filename": "report.pdf",
    "doc_id": "report_hash123",
    "chunk_index": 0,
    "total_chunks": 15,
    "upload_time": "2026-01-29T10:30:00"
  }
}
```

**Indexes**:
- HNSW index on embeddings (automatic)
- Metadata filters (automatic)

## Security Considerations

### Current Implementation

- CORS: Allow all origins (for development)
- API Keys: Environment variables
- File Upload: PDF validation only
- No authentication

### Production Recommendations

1. **Authentication**:
   - JWT tokens
   - OAuth 2.0 integration
   - Rate limiting per user

2. **Input Validation**:
   - File size limits (50MB max)
   - File type whitelist
   - Query length limits
   - SQL injection prevention (N/A - NoSQL)

3. **CORS**:
   - Specify frontend domains
   - Credentials handling
   - Preflight caching

4. **API Keys**:
   - Secret management (AWS Secrets, etc.)
   - Key rotation
   - Usage monitoring

5. **Data Privacy**:
   - User data isolation
   - Document encryption at rest
   - Audit logging

## Scalability

### Current Limitations

- Single server instance
- In-memory vector search
- No caching layer
- Synchronous processing

### Scaling Strategies

#### Horizontal Scaling

```
┌─────────┐
│ Load    │
│Balancer │
└────┬────┘
     │
     ├──────┬──────┬──────┐
     │      │      │      │
   ┌─▼─┐  ┌─▼─┐  ┌─▼─┐  ┌─▼─┐
   │API│  │API│  │API│  │API│
   │ 1 │  │ 2 │  │ 3 │  │ 4 │
   └─┬─┘  └─┬─┘  └─┬─┘  └─┬─┘
     │      │      │      │
     └──────┴──────┴──────┘
            │
      ┌─────▼─────┐
      │  Shared   │
      │ ChromaDB  │
      └───────────┘
```

#### Performance Optimizations

1. **Caching**:
   - Redis for frequent queries
   - Embedding cache
   - Response caching

2. **Async Processing**:
   - Celery for document processing
   - Message queue (RabbitMQ)
   - Background workers

3. **Database Optimization**:
   - Pinecone for larger scale
   - Distributed ChromaDB
   - Sharding by document type

4. **Frontend Optimization**:
   - Code splitting
   - Lazy loading
   - CDN for assets

## Monitoring & Observability

### Metrics to Track

1. **Performance**:
   - Query latency (p50, p95, p99)
   - Upload time
   - Embedding generation time
   - Database query time

2. **Usage**:
   - Documents uploaded
   - Queries per minute
   - Active users
   - API calls

3. **Quality**:
   - Confidence scores
   - User feedback
   - Error rates
   - Timeout rates

### Recommended Tools

- **Logs**: Structured logging (JSON)
- **Metrics**: Prometheus + Grafana
- **Tracing**: OpenTelemetry
- **Alerts**: PagerDuty / Sentry

## Testing Strategy

### Unit Tests

```python
def test_chunk_text():
    text = "A" * 2000
    chunks = chunk_text(text, chunk_size=1000, overlap=200)
    assert len(chunks) == 2
    assert len(chunks[0]) <= 1000
    assert chunks[0][-200:] == chunks[1][:200]  # Overlap check
```

### Integration Tests

```python
def test_upload_and_query():
    # Upload document
    response = client.post("/upload", files={"file": test_pdf})
    assert response.status_code == 200
    
    # Query document
    response = client.post("/query", json={"question": "test"})
    assert response.status_code == 200
    assert "answer" in response.json()
```

### Load Tests

```bash
# Using locust or k6
k6 run --vus 50 --duration 30s load_test.js
```

## Deployment Architecture

### Development

```
localhost:3000 (Frontend) → localhost:8000 (Backend)
```

### Production

```
CDN (CloudFlare)
    ↓
Frontend (Vercel/Netlify)
    ↓
Backend (Render/Railway)
    ↓
Database (Hosted ChromaDB or Pinecone)
```

## Future Enhancements

1. **Multi-modal Support**: Images, tables, charts
2. **Conversation History**: Chat-based interaction
3. **Document Comparison**: Compare multiple docs
4. **Advanced Search**: Filters, date ranges
5. **Export Features**: Download answers, citations
6. **Collaboration**: Share documents, team workspaces

## Cost Analysis

### Per 1000 Users/Month

| Component | Cost |
|-----------|------|
| OpenAI API | $50-200 |
| Hosting (Backend) | $25-100 |
| Hosting (Frontend) | $0-50 |
| Database | $0-50 |
| **Total** | **$75-400** |

**Optimization Tips**:
- Use GPT-3.5 instead of GPT-4
- Cache common queries
- Batch embedding requests
- Use free tiers when possible

---

Last Updated: January 2026
