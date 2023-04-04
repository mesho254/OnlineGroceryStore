import mongoose from "mongoose";
import bcrypt from 'bcrypt'

const {Schema} = mongoose;

const UsersSchema = new Schema({
    first_name: {type: String},
    last_name: {type: String},
    email: {type: String, required: true},
    password: {type: String, required: true},
    role: {type: String, enum: ['USER', 'ADMIN'], default: "USER"},
    phone: {type: String},
    wishlist: {type: Array}
});

UsersSchema.pre('save', async function (next) {
    if( !this.isModified('password') ) return next();

    this.password = await bcrypt.hash(this.password, 10);

    next();
});




const Users = mongoose.model('Users', UsersSchema);
export default Users;