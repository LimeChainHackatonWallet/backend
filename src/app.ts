import express, { Express } from 'express';
import dotenv from 'dotenv';
// import authRoutes from './routes/auth-routes';

dotenv.config();

// connectToDB();

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// routes
// app.use('/auth', authRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});