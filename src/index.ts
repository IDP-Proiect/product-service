import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client'
import axios from 'axios';
import multer from 'multer';
import FormData from "form-data";

const prisma = new PrismaClient()

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
const upload = multer();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Utility function that validates a token
interface AuthResponse {
    success: boolean;
    message: string;
}
const validateToken = async (token: string) => {
    const validation = await axios.post<AuthResponse>('http://localhost:8080/api/validation', {
        token: token
    });
    return validation.data;
}

// Get all colors
app.get('/api/colors', async (req: Request, res: Response) => {
    const colors = await prisma.color.findMany();
    return res.json({
        success: true,
        data: colors
    });
});

// Get single product
interface GetProductIDParams {
    id: string;
}

app.get('/api/colors/:id', async (req: Request<GetProductIDParams>, res: Response) => {
    const product = await prisma.color.findUnique({
        where: {
            id: req.params.id
        }
    });
    return res.json({
        success: true,
        data: product
    });
});

// Create color
interface CreateColorReqBody {
    token: string;
    description: string;
    price: string;
    quantity: string;
}
app.post('/api/colors', upload.single('file'), async (req: Request, res: Response) => {

    // Grab form data and file from request
    const metadata = req.body as CreateColorReqBody;
    const image_file = req.file;

    // Verify credentials by sending token to auth service

    const validationResponse = await validateToken(req.body.token);
    console.log(validationResponse)
    if (validationResponse.success == false) {
        return res.json({
            success: false,
            message: 'Invalid credentials',
        });
    }

    // Generate form data with file
    const formData = new FormData();
    formData.append('file', Buffer.from(image_file?.buffer || "empty file"), image_file?.originalname);
    // Upload product image 
    const uploadResponse = await axios.post('http://localhost:9798/api/insertImage', formData, { headers: formData.getHeaders() }).then(function (response) {
        console.log(response.data);
        return response.data.data;
    }).catch(function (error) {
        console.log(error);
        return undefined;
    }
    );

    // If image upload was successful, create product
    if (uploadResponse) {
        const color = await prisma.color.create({
            data: {
                description: metadata.description,
                price: parseInt(metadata.price),
                quantity: parseInt(metadata.quantity),
                pictureUrl: uploadResponse
            }
        });
        return res.json({
            success: true,
            data: color
        });
    } else {
        return res.json({
            success: false,
            message: 'Image upload failed',
        });
    }

});

interface ReserveColorReqBody {
    colorId: string;
    quantity: string;
}
app.post('/api/reserve', async (req: Request<null, ReserveColorReqBody>, res: Response) => {

    // Try to update the color table and decremet the quantity
    const color = await prisma.color.updateMany({
        where: {
            id: req.body.colorId,
            quantity: {
                gte: parseInt(req.body.quantity)
            }
        },
        data: {
            quantity: {
                decrement: parseInt(req.body.quantity)
            }
        }
    });

    if (color.count == 0) {
        return res.json({
            success: false,
            message: 'Not enough quantity',
        });
    }

    res.status(200).json({
        success: true,
        data: 'Enough quantity'
    });

});

interface ReleaseColorReqBody {
    colorId: string;
    quantity: string;
}
app.post('/api/release', async (req: Request <null, ReleaseColorReqBody>, res: Response) => {

    const quantity_int = parseInt(req.body.quantity);
    if (quantity_int < 0) {
        return res.json({
            success: false,
            message: 'Invalid quantity',
        });
    }

    // Try to update the color table and increment the quantity
    const color = await prisma.color.updateMany({
        where: {
            id: req.body.colorId,
        },
        data: {
            quantity: {
                increment: quantity_int
            }
        }
    });

    if (color.count == 0) {
        return res.json({
            success: false,
            message: 'Release failed',
        });
    }

    res.status(200).json({
        success: true,
        data: 'Release successful'
    });
});

app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

