import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator_service:8000';

app.use(cors());
app.use(express.json());

// Root Route
app.get('/', (req: Request, res: Response) => {
    res.send('BFF Service is Running');
});

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'bff-interface', mode: 'proxy' });
});

// Proxy Middleware Logic (Simplified for now)
// In production, we might use http-proxy-middleware, but for granular control we'll wrap headers manually here
app.use('/api', async (req: Request, res: Response) => {
    const url = `${ORCHESTRATOR_URL}${req.url}`;
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            headers: { ...req.headers, host: undefined } // Forward headers but strip host
        });
        res.status(response.status).send(response.data);
    } catch (error: any) {
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(502).json({ error: 'Orchestrator unavailable', details: error.message });
        }
    }
});

app.listen(port, () => {
    console.log(`BFF Service running on port ${port}`);
    console.log(`Proxying to Orchestrator at: ${ORCHESTRATOR_URL}`);
});
