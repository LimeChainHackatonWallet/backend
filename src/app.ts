import express, { Express } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import sponsorshipRoutes from "./routes/sponsorshipRouter"
import walletRoutes from "./routes/walletRouter";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'OK', 
      message: 'Server is running',
      timestamp: new Date().toISOString()
    });
  });

// routes
app.use('/api', sponsorshipRoutes);
app.use('/wallet', walletRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});