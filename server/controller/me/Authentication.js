import Users from "../../model/Users.js";
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

export const login = async (req, res) => {
    const {email, password} = req.body;
    

    if (!email || !password)
        return res.status(400).json({message: "Email address or Password is not provided"})
  

    try {
        const user = await Users.findOne({email});

        
    //    console.log(user)

        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({status: "fail", message: "email or password is incorrect"})

    

        const token = jwt.sign({
            id: user._id,
            email: user.email
        }, process.env.JWT_SECRET_KEY, {expiresIn: "1d"});
        return res.status(200).json({
            user: {
                _id: user._id,
                email: user.email,
                first_name: user.first_name,
                phone: user.phone,
                address: user.address,
                role: user.role,
                wishlist: user.wishlist
            },
            token
        });
    } catch (e) {
        return res.status(400).json({message: e.message});
    }
}

export const verifyUser = async (req, res) => {
    const {id} = req.body;
    try {
        const user = await Users.findById(id, {password: 0})
        return res.status(200).json({...user?._doc});
    } catch (e) {
        return res.status(404).json({message: "User not found"});
    }
}

export const verifyRole = async (req, res) => {
    try {
        const {id, role} = req.body;

        const user = await Users.findById(id, {password: 0});

        if (!user)
            return res.status(404).json({message: `User ${id} was not found`});

        if (role !== user.role)
            return res.status(401).json({message: "Unauthorized user"});

        return res.status(200).json({user});
    } catch (e) {
        return res.status(400).json({message: e.message});
    }
}

export const signup = async(req,res) => {
    const {email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({message: "Email address or Password is not provided"})

    try { 
        const user = await Users.findOne({email});
        // if (!user)
        //         return res.status(404).json({message: "User was not found"})

        if( user ){
            return res.status(400).json({message: "User already exists"})
        }

        const newUser = await Users.create({
            email: req.body.email,
            password:req.body.password,
            phone: req.body.phone,
            first_name: req.body.first_name,
            address: req.body.address,
            role: req.body.role,
            wishlist: req.body.wishlist
        });

       


        

        return res.status(200).json({
            status: "success",
            data: {
                user: newUser
            }
        });
        
    }catch(error){
        console.log('SIGNUP ERROR', error)
        return res.status(400).json({message: error.message});     
    }
}
