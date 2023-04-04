import mongoose from "mongoose";
const {Schema} = mongoose;
import { v4 as uuidv4,} from 'uuid'

const productSchema = new Schema({
    product_id: {type: String, unique:true},
    name: String,
    price: Number,
    weight: Number,
    measurement: String,
    category: String,
    image:
    {
        type: String,
        default: 'https://res.cloudinary.com/crunchbase-production/image/upload/c_lpad,h_256,w_256,f_auto,q_auto:eco,dpr_1/lqcm8z8qwhi42efm2lue'
    },
    stock: {
        type: Number,
        default: 0
    }
});

productSchema.pre('save', function(next) {
    this.product_id = uuidv4()
    next()
})



const Products = mongoose.model('Products',productSchema);
export default Products;
