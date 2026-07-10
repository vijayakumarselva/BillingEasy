FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Catch import errors at build time
RUN python -c "
import sys
sys.path.insert(0, '.')
# Test reportlab
import reportlab; print('reportlab', reportlab.Version)
# Test pdf_invoice
from pdf_invoice import generate_invoice_pdf; print('pdf_invoice OK')
# Test ai_helpers
import ai_helpers; print('ai_helpers OK')
print('All imports OK')
"

CMD uvicorn server:app --host 0.0.0.0 --port $PORT
