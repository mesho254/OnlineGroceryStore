import express from "express";
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import products from "./routes/products.js";
import shipping from "./routes/shipping.js"
import orders from './routes/orders.js';
import payments from './routes/payments.js';
import notifications from "./routes/notifications.js";
import sgMail from '@sendgrid/mail';
import MainRouter from "./routes/me.js";
import Stripe from "stripe";

const app = express();
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_KEY);
export const stripe = Stripe(process.env.STRIPE_PRIVATE_KEY);
const corsOptions ={
  origin:'https://online-grocery-store-sable.vercel.app/', 
  credentials:true,            //access-control-allow-credentials:true
  optionSuccessStatus:200
}

app.use(bodyParser.json({extended: true}));
app.use(express.json())
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors(corsOptions));

app.use('/orders', orders);
app.use('/payments', payments);
app.use('/products', products);
app.use('/shipping',shipping);
app.use('/notifications', notifications);
app.use('/api/v1',MainRouter);

app.get('/', (req, res) => {
    res.status(200).json({
        team_name: "Mesho Devs",
        dev_team: ["Mesho", "Mesho254"].sort()
    })
});


app.use('*',(req,res) => {
    res.status(500).json({
        status:'error', 
        message: 'This route does not exist'
    })
})

const PORT = process.env.PORT || 5000;

const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true
}

mongoose.connect(
    process.env.CONNECTION_URL,
    mongooseOptions,
    // {
    //   useNewUrlParser: true,
    //   useUnifiedTopology: true,
    // },
    (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log("Connected to MongoDB");
      }
    },
  );

    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))


// mongoose.connect(process.env.CONNECTION_URL, mongooseOptions, handleServerStartup)


export default app