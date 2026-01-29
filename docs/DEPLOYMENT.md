# Deployment Guide

This guide covers multiple deployment options for the RAG Document Assistant.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Render Deployment (Recommended)](#render-deployment)
- [Vercel + Railway](#vercel--railway)
- [Docker Deployment](#docker-deployment)
- [Hugging Face Spaces](#hugging-face-spaces)
- [Post-Deployment](#post-deployment)

## Prerequisites

✅ OpenAI API key
✅ GitHub account
✅ Project pushed to GitHub repo

## Render Deployment (Recommended)

### Why Render?
- ✅ Free tier available
- ✅ Auto-deploy from GitHub
- ✅ Simple environment variable management
- ✅ Built-in SSL certificates

### Step 1: Deploy Backend

1. Go to [render.com](https://render.com) and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   ```
   Name: rag-document-assistant-api
   Region: Choose closest to users
   Root Directory: backend
   Environment: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn app:app --host 0.0.0.0 --port $PORT
   ```
5. Add Environment Variables:
   - `OPENAI_API_KEY`: Your OpenAI key
6. Click "Create Web Service"
7. Copy the deployed URL (e.g., `https://rag-api-xxx.onrender.com`)

### Step 2: Deploy Frontend

1. Update `frontend/src/App.jsx`:
   ```javascript
   const API_URL = 'https://YOUR-BACKEND-URL.onrender.com';
   ```
2. Commit and push changes
3. In Render, click "New +" → "Static Site"
4. Connect your repository
5. Configure:
   ```
   Name: rag-document-assistant
   Root Directory: frontend
   Build Command: npm install && npm run build
   Publish Directory: dist
   ```
6. Click "Create Static Site"

### Step 3: Test

Visit your frontend URL and test:
- Upload a PDF
- Ask a question
- Verify answer appears

## Vercel + Railway

### Backend (Railway)

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and initialize:
   ```bash
   railway login
   cd backend
   railway init
   ```

3. Add environment variables:
   ```bash
   railway variables set OPENAI_API_KEY=your_key_here
   ```

4. Deploy:
   ```bash
   railway up
   ```

5. Get URL:
   ```bash
   railway domain
   ```

### Frontend (Vercel)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Update API URL in `frontend/src/App.jsx`

3. Deploy:
   ```bash
   cd frontend
   vercel
   ```

4. Follow prompts and deploy to production

## Docker Deployment

### Using Docker Compose

1. Create `docker-compose.yml` in project root:
   ```yaml
   version: '3.8'
   
   services:
     backend:
       build: ./backend
       ports:
         - "8000:8000"
       environment:
         - OPENAI_API_KEY=${OPENAI_API_KEY}
       volumes:
         - ./backend/chroma_db:/app/chroma_db
   
     frontend:
       build: ./frontend
       ports:
         - "80:80"
       depends_on:
         - backend
   ```

2. Create `.env` file:
   ```bash
   OPENAI_API_KEY=your_key_here
   ```

3. Deploy:
   ```bash
   docker-compose up -d
   ```

4. Access at `http://localhost`

### Individual Containers

**Backend:**
```bash
cd backend
docker build -t rag-backend .
docker run -d -p 8000:8000 \
  -e OPENAI_API_KEY=your_key \
  -v $(pwd)/chroma_db:/app/chroma_db \
  rag-backend
```

**Frontend:**
```bash
cd frontend
# Update API_URL in src/App.jsx first
docker build -t rag-frontend .
docker run -d -p 80:80 rag-frontend
```

## Hugging Face Spaces

### Backend Space

1. Create new Space on [huggingface.co/spaces](https://huggingface.co/spaces)
2. Choose "Docker" as Space type
3. Create Dockerfile:
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY backend/requirements.txt .
   RUN pip install -r requirements.txt
   COPY backend/app.py .
   EXPOSE 7860
   CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
   ```
4. Add secret `OPENAI_API_KEY` in Space settings
5. Push code to Space

### Frontend Space

1. Create new Static Space
2. Upload built files from `frontend/dist/`
3. Update API_URL to point to backend Space

## AWS EC2 (Production)

### Setup

1. Launch Ubuntu 22.04 EC2 instance (t3.medium recommended)
2. Configure Security Group:
   - Port 22 (SSH)
   - Port 80 (HTTP)
   - Port 443 (HTTPS)
   - Port 8000 (API)

### Installation

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3-pip nodejs npm nginx certbot python3-certbot-nginx

# Clone repository
git clone https://github.com/yourusername/rag-document-assistant.git
cd rag-document-assistant

# Setup backend
cd backend
pip3 install -r requirements.txt
sudo nano .env  # Add OPENAI_API_KEY

# Create systemd service
sudo nano /etc/systemd/system/rag-backend.service
```

Add to service file:
```ini
[Unit]
Description=RAG Backend API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/rag-document-assistant/backend
Environment="PATH=/home/ubuntu/.local/bin"
EnvironmentFile=/home/ubuntu/rag-document-assistant/backend/.env
ExecStart=/home/ubuntu/.local/bin/uvicorn app:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
```

```bash
# Start backend
sudo systemctl enable rag-backend
sudo systemctl start rag-backend

# Setup frontend
cd ../frontend
npm install
npm run build

# Configure nginx
sudo nano /etc/nginx/sites-available/rag-app
```

Add to nginx config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /home/ubuntu/rag-document-assistant/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/rag-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL (optional but recommended)
sudo certbot --nginx -d your-domain.com
```

## Post-Deployment

### Testing

1. **Health Check:**
   ```bash
   curl https://your-api-url/health
   ```

2. **Upload Test:**
   ```bash
   curl -X POST https://your-api-url/upload \
     -F "file=@test.pdf"
   ```

3. **Query Test:**
   ```bash
   curl -X POST https://your-api-url/query \
     -H "Content-Type: application/json" \
     -d '{"question": "test question"}'
   ```

### Monitoring

**Set up monitoring:**
- Use Render's built-in logs
- Set up Sentry for error tracking
- Configure Uptime Robot for availability monitoring

**Key Metrics:**
- Response time
- Error rate
- Memory usage
- API usage costs

### Security

1. **Environment Variables:**
   - Never commit API keys
   - Use platform secret management
   - Rotate keys regularly

2. **CORS:**
   Update `app.py` for production:
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["https://your-frontend-domain.com"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

3. **Rate Limiting:**
   Consider adding rate limiting in production

### Updating

**Render:** Auto-deploys on git push

**Railway:** 
```bash
railway up
```

**Docker:**
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Troubleshooting

**Issue:** Backend won't start
**Check:** 
- Logs: `railway logs` or Render dashboard
- Environment variables are set
- Port is correct

**Issue:** Frontend can't connect
**Check:**
- API_URL is correct
- CORS settings
- Network/firewall rules

**Issue:** Out of memory
**Check:**
- Upgrade instance size
- Check ChromaDB persistence
- Review document sizes

## Cost Estimates

| Platform | Backend | Frontend | Total/Month |
|----------|---------|----------|-------------|
| Render Free | $0 | $0 | $0 |
| Render Paid | $7 | $0 | $7 |
| Vercel + Railway | $5 | $0 | $5 |
| AWS EC2 | $15-50 | Included | $15-50 |
| Hugging Face | $0 | $0 | $0 |

Plus OpenAI API costs: ~$5-50/month depending on usage

## Support

Questions? Check:
- [GitHub Issues](https://github.com/yourusername/rag-document-assistant/issues)
- [Documentation](../README.md)
- [Architecture Guide](./ARCHITECTURE.md)

---

Happy Deploying! 🚀
