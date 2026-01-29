import React, { useState, useEffect } from 'react';
import { Upload, Send, FileText, Trash2, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

const API_URL = 'http://localhost:8000';

export default function RAGDocumentAssistant() {
  const [documents, setDocuments] = useState([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ latency: 0, confidence: 0 });

  // Fetch documents on load
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents`);
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      await fetchDocuments();
      event.target.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const response = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, top_k: 3 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Query failed');
      }

      const data = await response.json();
      setAnswer(data);
      setStats({
        latency: data.latency_ms,
        confidence: data.confidence,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    try {
      await fetch(`${API_URL}/documents/${docId}`, {
        method: 'DELETE',
      });
      await fetchDocuments();
    } catch (err) {
      setError('Failed to delete document');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-12 text-center">
          <div className="inline-block mb-4">
            <div className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full border border-blue-500/30 backdrop-blur-sm">
              <FileText className="w-6 h-6 text-blue-400" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                RAG Document Assistant
              </h1>
            </div>
          </div>
          <p className="text-slate-400 text-lg">
            Upload documents, ask questions, get intelligent answers powered by AI
          </p>
        </header>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Upload & Documents */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-400" />
                Upload Documents
              </h2>
              
              <label className="block">
                <div className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-300 hover:border-blue-500 hover:bg-blue-500/5
                  ${uploading ? 'border-blue-500 bg-blue-500/5' : 'border-slate-700'}
                `}>
                  <Upload className={`w-12 h-12 mx-auto mb-3 ${uploading ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`} />
                  <p className="text-slate-300 font-medium mb-1">
                    {uploading ? 'Uploading...' : 'Click to upload PDF'}
                  </p>
                  <p className="text-slate-500 text-sm">
                    or drag and drop
                  </p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Documents List */}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                Documents ({documents.length})
              </h2>
              
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {documents.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">
                    No documents uploaded yet
                  </p>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate mb-1">
                            {doc.filename}
                          </p>
                          <p className="text-slate-400 text-sm">
                            {doc.chunk_count} chunks
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all p-2 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Query & Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Query Section */}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-400" />
                Ask a Question
              </h2>
              
              <form onSubmit={handleQuery} className="space-y-4">
                <div className="relative">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What would you like to know about your documents?"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
                    rows="3"
                    disabled={loading || documents.length === 0}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading || !question.trim() || documents.length === 0}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Get Answer
                    </>
                  )}
                </button>
              </form>

              {documents.length === 0 && (
                <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-200 text-sm">
                    Upload at least one document to start asking questions
                  </p>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-200">{error}</p>
              </div>
            )}

            {/* Answer Section */}
            {answer && (
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-2xl animate-fadeIn">
                {/* Stats Bar */}
                <div className="flex gap-4 mb-6 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-lg">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-slate-300 text-sm font-medium">
                      {stats.latency.toFixed(0)}ms
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-slate-300 text-sm font-medium">
                      {(stats.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                </div>

                {/* Answer */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    Answer
                  </h3>
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {answer.answer}
                    </p>
                  </div>
                </div>

                {/* Sources */}
                {answer.sources && answer.sources.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Sources
                    </h3>
                    <div className="space-y-3">
                      {answer.sources.map((source, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/30 rounded-lg p-4 border border-slate-700"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-cyan-400 font-medium text-sm">
                              {source.filename}
                            </span>
                            <span className="text-slate-500 text-xs">
                              {(source.relevance * 100).toFixed(0)}% relevant
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm leading-relaxed">
                            {source.chunk}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-slate-500 text-sm">
            Built with FastAPI, ChromaDB, OpenAI & React
          </p>
        </footer>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(51, 65, 85, 0.3);
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.5);
          border-radius: 3px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.7);
        }
      `}</style>
    </div>
  );
}
