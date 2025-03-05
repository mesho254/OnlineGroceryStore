import styles from './adminNewProduct.module.css';
import { useState } from "react";
import { useDispatch } from "react-redux";
import { postProduct } from "../../../../actions/products";
import SuccessImage from "../../../../shared/assets/state/success.png";
import Error from "../../../../components/feedback/error/Error";

const FORM = 'FORM';
const SUCCESS = 'SUCCESS';

const INITIAL_PRODUCT = {
    product_id: '',
    name: '',
    price: '',
    weight: '',
    measurement: '',
    category: '',
    stock: '',
    image: null, // Changed to file instead of URL
};

const AdminNewProduct = () => {
    const dispatch = useDispatch();
    const categories = ["Beverages", "Breakfast", "Chips & Crackers", "Dairy & Eggs", "Fruits & Vegetables", "Meat Poultry and Seafood"];
    const [state, setState] = useState(FORM);
    const [error, setError] = useState('');
    const [product, setProduct] = useState(INITIAL_PRODUCT);

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        setProduct({
            ...product,
            [name]: name === 'image' ? files[0] : value, // Handle file input
        });
    };

    const handleSubmit = () => {
        if (!product.product_id || product.product_id.length !== 6)
            return setError('Enter a 6 characters product id');
        if (!product.name)
            return setError('Enter a valid product name');
        if (!product.price)
            return setError('Enter a valid product price');
        if (!product.weight)
            return setError('Enter a valid product weight');
        if (!product.measurement)
            return setError('Enter a valid product measurement');
        if (!product.category || product.category === 'Category')
            return setError('Enter a valid product category');
        if (!product.image)
            return setError('Upload a product image');

        const formData = new FormData();
        Object.entries(product).forEach(([key, value]) => {
            formData.append(key, value);
        });

        const onSuccess = () => {
            setState(SUCCESS);
        };

        const onError = (e) => {
            setError(e.message);
        };

        dispatch(postProduct(formData, onSuccess, onError)); // Send FormData
    };

    const handleReset = () => {
        setState(FORM);
        setProduct(INITIAL_PRODUCT);
    };

    if (state === SUCCESS)
        return (
            <div className={styles['wrapper']}>
                <div className={styles['response-wrapper']}>
                    <img src={SuccessImage} alt={'Successfully Updated'} />
                    <p>{product.name} was added successfully to the database</p>
                    <div className={'btn2'} onClick={handleReset}>Add More</div>
                </div>
            </div>
        );

    return (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError} />}
            <div className={'heading'}>
                <h1>New Product</h1>
            </div>
            <div className={styles['form']}>
                <input maxLength={6} placeholder={'Product Id'} name={'product_id'} value={product.product_id}
                       onChange={handleChange} />
                <input placeholder={'Product Name'} name={'name'} value={product.name} className={styles['two']}
                       onChange={handleChange} />
                <input placeholder={'Price'} type={'number'} name={'price'} value={product.price}
                       onChange={handleChange} />
                <input placeholder={'Weight'} type={'number'} name={'weight'} value={product.weight}
                       onChange={handleChange} />
                <input placeholder={'Measurement'} maxLength={3} name={'measurement'} value={product.measurement}
                       onChange={handleChange} />
                <select defaultValue={'Category'} className={styles['full']} name={'category'}
                        onChange={handleChange}>
                    <option disabled={true}>Category</option>
                    {categories.map((category, i) => <option key={i} value={category}>{category}</option>)}
                </select>
                <input placeholder={'Stock Quantity'} type={'number'} name={'stock'} value={product.stock}
                       onChange={handleChange} />
                <input placeholder={'Image'} type={'file'} name={'image'} className={styles['full']}
                       onChange={handleChange} /> {/* File input */}
            </div>
            <button onClick={handleSubmit} className={`btn1 ${styles['submit']}`}>Add</button>
        </div>
    );
};

export default AdminNewProduct;
