import express, { Express } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import walletRoutes from './routes/wallet';
import authRoutes from './routes/auth';

dotenv.config();

// connectToDB();

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

app.use('/test', express.static(path.join(__dirname, '../test-client')));

// routes
app.use('/api/wallet', walletRoutes);
app.use('/api/auth', authRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

export default app;