import styles from '../admin/products/new/adminNewProduct.module.css';
import {useEffect, useState} from "react";
import * as api from "../../api";
import {formatKES} from "../../utils/pricing";

const CATEGORIES = [
    "Fruits and Vegetables",
    "Meat Poultry and Seafood",
    "Dairy and Eggs",
    "Breakfast",
    "Beverages",
    "Chocolate and Candy",
    "Chips and Crackers",
    "Ice Cream",
];

const MEASUREMENTS = ["g", "kg", "ml", "L", "pcs", "pack"];

const WIZARD_STEPS = [
    {
        step: 1,
        title: 'Basic Details',
        subtitle: 'Name, category & description',
        icon: 'inventory_2',
    },
    {
        step: 2,
        title: 'Media Gallery',
        subtitle: 'Card cover & slider images',
        icon: 'photo_library',
    },
    {
        step: 3,
        title: 'Pricing & Stock',
        subtitle: 'KES price, discount & stock',
        icon: 'sell',
    },
    {
        step: 4,
        title: 'Farm & Storage',
        subtitle: 'Seller, dates & shelf life',
        icon: 'agriculture',
    },
    {
        step: 5,
        title: 'Nutrition & Review',
        subtitle: 'Macros & publish preview',
        icon: 'fact_check',
    },
];

const toDateInputValue = (val) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
};

const buildInitialProduct = (editingProduct, sellerProfile) => {
    const storeName = sellerProfile?.store_name || 'FreshMart Farm Partner';
    const storeLocation = sellerProfile?.business_location || 'Nairobi, Kenya';

    if (editingProduct) {
        const staged = editingProduct.pending_changes || null;
        const src = staged ? {...editingProduct, ...staged} : editingProduct;
        const nutr = src.nutrition || editingProduct.nutrition || {};
        return {
            name: src.name || '',
            description: src.description || '',
            category: src.category || 'Fruits and Vegetables',
            brand: src.brand || storeName,
            sku: src.sku || '',
            origin: src.origin || storeLocation,
            is_organic: src.is_organic !== undefined ? Boolean(src.is_organic) : true,
            price: src.price !== undefined ? String(src.price) : '',
            discount: src.discount !== undefined ? String(src.discount) : '0',
            flash_sale: Boolean(src.flash_sale),
            flash_sale_ends_at: toDateInputValue(src.flash_sale_ends_at),
            weight: src.weight !== undefined ? String(src.weight) : '',
            measurement: src.measurement || 'g',
            stock: src.stock !== undefined ? String(src.stock) : '0',
            seller_name: storeName,
            seller_location: staged?.seller_location || editingProduct.seller?.location || storeLocation,
            shelf_life: src.shelf_life || '5–7 Days',
            storage_tips:
                src.storage_tips ||
                'Keep refrigerated at 2°C–6°C or store in a cool, dry place.',
            harvest_date: toDateInputValue(src.harvest_date),
            expiry_date: toDateInputValue(src.expiry_date),
            tags: Array.isArray(src.tags)
                ? src.tags.join(', ')
                : src.tags || 'Farm Fresh, Organic, Quality Checked',
            calories: nutr.calories || '110 kcal / 100g',
            protein: nutr.protein || '3.5g',
            carbs: nutr.carbs || '12.0g',
            fat: nutr.fat || '1.5g',
            fiber: nutr.fiber || '3.0g',
            vitamins: Array.isArray(nutr.vitamins)
                ? nutr.vitamins.join(', ')
                : nutr.vitamins || 'Vitamin A, Vitamin C, Iron, Calcium',
        };
    }

    return {
        name: '',
        description: '',
        category: sellerProfile?.category_focus && CATEGORIES.includes(sellerProfile.category_focus)
            ? sellerProfile.category_focus
            : 'Fruits and Vegetables',
        brand: storeName,
        sku: '',
        origin: storeLocation,
        is_organic: true,
        price: '',
        discount: '0',
        flash_sale: false,
        flash_sale_ends_at: '',
        weight: '',
        measurement: 'g',
        stock: '50',
        seller_name: storeName,
        seller_location: storeLocation,
        shelf_life: '5–7 Days',
        storage_tips: 'Keep refrigerated at 2°C–6°C or store in a cool, dry place.',
        harvest_date: new Date().toISOString().slice(0, 10),
        expiry_date: '',
        tags: 'Farm Fresh, Organic, Quality Checked',
        calories: '110 kcal / 100g',
        protein: '3.5g',
        carbs: '12.0g',
        fat: '1.5g',
        fiber: '3.0g',
        vitamins: 'Vitamin A, Vitamin C, Iron, Calcium',
    };
};

const buildInitialMedia = (editingProduct) => {
    if (!editingProduct) return [];
    const staged = editingProduct.pending_changes || null;
    const imgSource =
        staged && Array.isArray(staged.images) && staged.images.length > 0
            ? [staged.image, ...staged.images]
            : [
                  editingProduct.image,
                  ...(Array.isArray(editingProduct.images) ? editingProduct.images : []),
              ];
    const rawList = Array.from(new Set(imgSource.filter(Boolean)));
    return rawList.map((url, idx) => ({
        id: `existing-${idx}-${url.slice(-12)}`,
        type: 'url',
        url,
        previewUrl: url,
    }));
};

const SellerProductWizard = ({editingProduct = null, sellerProfile, onSaved, onCancel}) => {
    const isEditMode = Boolean(editingProduct?.product_id);
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [product, setProduct] = useState(() =>
        buildInitialProduct(editingProduct, sellerProfile)
    );
    const [mediaItems, setMediaItems] = useState(() => buildInitialMedia(editingProduct));
    const [imageUrlInput, setImageUrlInput] = useState('');

    useEffect(() => {
        setCurrentStep(1);
        setError('');
        setProduct(buildInitialProduct(editingProduct, sellerProfile));
        setMediaItems(buildInitialMedia(editingProduct));
        setImageUrlInput('');
    }, [editingProduct?.product_id]);

    const handleChange = (e) => {
        const {name, value, type, checked} = e.target;
        setProduct((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleFilesSelected = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const newItems = files.map((file) => ({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            type: 'file',
            file,
            previewUrl: URL.createObjectURL(file),
        }));

        setMediaItems((prev) => [...prev, ...newItems]);
        e.target.value = '';
    };

    const handleAddImageUrl = () => {
        const trimmed = imageUrlInput.trim();
        if (!trimmed) return;
        setMediaItems((prev) => [
            ...prev,
            {
                id: `url-${Date.now()}-${Math.random()}`,
                type: 'url',
                url: trimmed,
                previewUrl: trimmed,
            },
        ]);
        setImageUrlInput('');
    };

    const handleSetPrimary = (index) => {
        if (index === 0) return;
        setMediaItems((prev) => {
            const copy = [...prev];
            const [selected] = copy.splice(index, 1);
            return [selected, ...copy];
        });
    };

    const handleRemoveImage = (index) => {
        setMediaItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const basePrice = Number(product.price || 0);
    const discountPct = Math.min(95, Math.max(0, Number(product.discount || 0)));
    const calculatedFinalPrice =
        discountPct > 0
            ? Number((basePrice * (1 - discountPct / 100)).toFixed(2))
            : Number(basePrice.toFixed(2));

    const categoryOptions =
        product.category && !CATEGORIES.includes(product.category)
            ? [product.category, ...CATEGORIES]
            : CATEGORIES;

    const measurementOptions =
        product.measurement && !MEASUREMENTS.includes(product.measurement)
            ? [product.measurement, ...MEASUREMENTS]
            : MEASUREMENTS;

    const validateStep = (stepToCheck) => {
        setError('');
        if (stepToCheck === 1) {
            if (!product.name.trim()) {
                setError('Step 1: Please enter the Product Name.');
                return false;
            }
            if (!product.category) {
                setError('Step 1: Please select a Category.');
                return false;
            }
            if (!product.description.trim()) {
                setError('Step 1: Please enter a Product Description.');
                return false;
            }
        }
        if (stepToCheck === 2) {
            if (mediaItems.length === 0) {
                setError(
                    'Step 2: Please upload at least one product image file or paste an image URL.'
                );
                return false;
            }
        }
        if (stepToCheck === 3) {
            if (!product.price || Number(product.price) <= 0) {
                setError('Step 3: Please enter a valid Regular Price in KES.');
                return false;
            }
            if (!product.weight || Number(product.weight) <= 0) {
                setError('Step 3: Please enter the Weight / Quantity per pack.');
                return false;
            }
            if (!product.measurement) {
                setError('Step 3: Please select a Measurement Unit.');
                return false;
            }
        }
        return true;
    };

    const handleNextStep = () => {
        if (!validateStep(currentStep)) return;
        setCurrentStep((prev) => Math.min(5, prev + 1));
    };

    const handlePrevStep = () => {
        setError('');
        setCurrentStep((prev) => Math.max(1, prev - 1));
    };

    const handleJumpToStep = (targetStep) => {
        if (isEditMode || targetStep < currentStep) {
            setError('');
            setCurrentStep(targetStep);
            return;
        }
        for (let s = currentStep; s < targetStep; s++) {
            if (!validateStep(s)) return;
        }
        setCurrentStep(targetStep);
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        for (let s = 1; s <= 3; s++) {
            if (!validateStep(s)) {
                setCurrentStep(s);
                return;
            }
        }

        setSubmitting(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('name', product.name.trim());
            formData.append('description', product.description.trim());
            formData.append('category', product.category);
            formData.append('brand', product.brand.trim());
            formData.append('sku', product.sku.trim());
            formData.append('origin', product.origin.trim());
            formData.append('is_organic', String(product.is_organic));
            formData.append('price', String(product.price));
            formData.append('discount', String(discountPct));
            formData.append('flash_sale', String(product.flash_sale));
            formData.append('flash_sale_ends_at', product.flash_sale_ends_at || '');
            formData.append('weight', String(product.weight));
            formData.append('measurement', product.measurement);
            formData.append('stock', String(product.stock || 0));
            formData.append('seller_location', product.seller_location.trim());
            formData.append('shelf_life', product.shelf_life.trim());
            formData.append('storage_tips', product.storage_tips.trim());
            formData.append('harvest_date', product.harvest_date || '');
            formData.append('expiry_date', product.expiry_date || '');
            formData.append('tags', product.tags);
            formData.append('media_updated', 'true');

            formData.append(
                'nutrition',
                JSON.stringify({
                    calories: product.calories.trim(),
                    protein: product.protein.trim(),
                    carbs: product.carbs.trim(),
                    fat: product.fat.trim(),
                    fiber: product.fiber.trim(),
                    vitamins: product.vitamins
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                })
            );

            const urlList = [];
            mediaItems.forEach((item, idx) => {
                if (item.type === 'file' && item.file) {
                    if (idx === 0) {
                        formData.append('image', item.file);
                    } else {
                        formData.append('images', item.file);
                    }
                } else if (item.type === 'url' && item.url) {
                    if (idx === 0) {
                        formData.append('image', item.url);
                    }
                    urlList.push(item.url);
                }
            });

            if (urlList.length > 0) {
                formData.append('image_urls', JSON.stringify(urlList));
            }

            if (isEditMode) {
                const res = await api.updateSellerProduct(editingProduct.product_id, formData);
                onSaved(
                    res.data?.message || `✓ Updated "${product.name.trim()}" with all details!`
                );
            } else {
                const res = await api.createSellerProduct(formData);
                onSaved(
                    res.data?.message ||
                        `✓ Submitted "${product.name.trim()}" for Admin review before publishing!`
                );
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save product.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.25rem'}}>
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        padding: '0.8rem 1.15rem',
                        borderRadius: '14px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                    }}
                >
                    {error}
                </div>
            )}

            {/* 5-Step Interactive Wizard Stepper */}
            <div className={styles['wizard-stepper']}>
                {WIZARD_STEPS.map((s) => {
                    const isCompleted = s.step < currentStep;
                    const isActive = s.step === currentStep;
                    return (
                        <button
                            key={s.step}
                            type="button"
                            onClick={() => handleJumpToStep(s.step)}
                            className={`${styles['wizard-step']} ${
                                isActive ? styles['wizard-step-active'] : ''
                            } ${isCompleted ? styles['wizard-step-done'] : ''}`}
                        >
                            <div className={styles['step-circle']}>
                                {isCompleted ? (
                                    <span className="material-symbols-outlined">check</span>
                                ) : (
                                    s.step
                                )}
                            </div>
                            <div className={styles['step-text']}>
                                <strong>{s.title}</strong>
                                <small>{s.subtitle}</small>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className={styles['form-grid']}>
                {/* ==================== STEP 1: BASIC DETAILS ==================== */}
                {currentStep === 1 && (
                    <section className={styles['section-card']}>
                        <div className={styles['sec-head']}>
                            <div>
                                <span className={styles['step-pill']}>
                                    STEP 1 OF 5 {isEditMode ? `• EDITING #${editingProduct.product_id}` : ''}
                                </span>
                                <h2>Basic Product Details</h2>
                                <p>
                                    Provide the product title, supermarket aisle category, brand,
                                    and description.
                                </p>
                            </div>
                        </div>

                        <div className={styles['row-2']}>
                            <div className={styles['field']}>
                                <label>Product Name *</label>
                                <input
                                    name="name"
                                    value={product.name}
                                    onChange={handleChange}
                                    placeholder="e.g. Fresh Sukuma Wiki (Kale)"
                                    required
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Category *</label>
                                <select
                                    name="category"
                                    value={product.category}
                                    onChange={handleChange}
                                >
                                    {categoryOptions.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Brand</label>
                                <input
                                    name="brand"
                                    value={product.brand}
                                    onChange={handleChange}
                                    placeholder="FreshMart Organics"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>SKU Code (Optional)</label>
                                <input
                                    name="sku"
                                    value={product.sku}
                                    onChange={handleChange}
                                    placeholder="e.g. FM-FV-051"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Origin / Region</label>
                                <input
                                    name="origin"
                                    value={product.origin}
                                    onChange={handleChange}
                                    placeholder="Limuru Highlands, Kenya"
                                />
                            </div>
                        </div>

                        <div className={styles['field']}>
                            <label>Product Description *</label>
                            <textarea
                                rows={4}
                                name="description"
                                value={product.description}
                                onChange={handleChange}
                                placeholder="Describe freshness, taste profile, how it's harvested, and culinary uses..."
                                required
                            />
                        </div>

                        <label className={styles['checkbox-label']}>
                            <input
                                type="checkbox"
                                name="is_organic"
                                checked={product.is_organic}
                                onChange={handleChange}
                            />
                            <span>Certified 100% Organic / Naturally Grown</span>
                        </label>
                    </section>
                )}

                {/* ==================== STEP 2: MEDIA GALLERY ==================== */}
                {currentStep === 2 && (
                    <section className={styles['section-card']}>
                        <div className={styles['sec-head']}>
                            <div>
                                <span className={styles['step-pill']}>STEP 2 OF 5</span>
                                <h2>Product Images (Card Cover & Details Slider)</h2>
                                <p>
                                    Add multiple images. The <strong>first image (#1)</strong> is
                                    shown on the Product Card; all images are shown in the Product
                                    Details slider.
                                </p>
                            </div>
                            <span className={styles['count-chip']}>
                                {mediaItems.length} Images Added
                            </span>
                        </div>

                        <div className={styles['upload-controls']}>
                            <label className={styles['file-drop-btn']}>
                                <span className="material-symbols-outlined">upload</span>
                                <span>Select One or Multiple Image Files</span>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={handleFilesSelected}
                                    hidden
                                />
                            </label>

                            <div className={styles['url-add-box']}>
                                <input
                                    type="url"
                                    value={imageUrlInput}
                                    onChange={(e) => setImageUrlInput(e.target.value)}
                                    onKeyDown={(e) =>
                                        e.key === 'Enter' &&
                                        (e.preventDefault(), handleAddImageUrl())
                                    }
                                    placeholder="Or paste an image URL (https://...)"
                                />
                                <button type="button" onClick={handleAddImageUrl}>
                                    + Add URL
                                </button>
                            </div>
                        </div>

                        {mediaItems.length === 0 ? (
                            <div className={styles['empty-gallery']}>
                                <span className="material-symbols-outlined">
                                    add_photo_alternate
                                </span>
                                <p>
                                    No images added yet. Upload files from your computer or paste an
                                    image URL above.
                                </p>
                            </div>
                        ) : (
                            <div className={styles['preview-grid']}>
                                {mediaItems.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className={`${styles['preview-card']} ${
                                            idx === 0 ? styles['preview-primary'] : ''
                                        }`}
                                    >
                                        <div className={styles['preview-top']}>
                                            <span className={styles['img-badge']}>
                                                {idx === 0
                                                    ? '★ Primary Card Image'
                                                    : `Slider #${idx + 1}`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveImage(idx)}
                                                className={styles['remove-img-btn']}
                                                title="Remove image"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <img src={item.previewUrl} alt={`Preview ${idx + 1}`}/>
                                        {idx !== 0 && (
                                            <button
                                                type="button"
                                                onClick={() => handleSetPrimary(idx)}
                                                className={styles['make-primary-btn']}
                                            >
                                                Set as Card Cover
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* ==================== STEP 3: PRICING & STOCK ==================== */}
                {currentStep === 3 && (
                    <section className={styles['section-card']}>
                        <div className={styles['sec-head']}>
                            <div>
                                <span className={styles['step-pill']}>STEP 3 OF 5</span>
                                <h2>Pricing, Discounts, Flash Sale & Stock</h2>
                                <p>
                                    Configure base KES pricing, promotional discounts, pack weight,
                                    and inventory stock.
                                </p>
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Regular Price (KES) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    name="price"
                                    value={product.price}
                                    onChange={handleChange}
                                    placeholder="e.g. 150"
                                    required
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Discount (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="95"
                                    name="discount"
                                    value={product.discount}
                                    onChange={handleChange}
                                    placeholder="0"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Calculated Selling Price</label>
                                <div className={styles['calc-preview']}>
                                    <strong>KES {calculatedFinalPrice.toFixed(2)}</strong>
                                    {discountPct > 0 && (
                                        <small>
                                            Saves KES {(basePrice - calculatedFinalPrice).toFixed(2)}
                                        </small>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Weight / Quantity Per Pack *</label>
                                <input
                                    type="number"
                                    min="0.1"
                                    step="any"
                                    name="weight"
                                    value={product.weight}
                                    onChange={handleChange}
                                    placeholder="e.g. 500"
                                    required
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Measurement Unit *</label>
                                <select
                                    name="measurement"
                                    value={product.measurement}
                                    onChange={handleChange}
                                >
                                    {measurementOptions.map((m) => (
                                        <option key={m} value={m}>
                                            {m}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles['field']}>
                                <label>Available Stock *</label>
                                <input
                                    type="number"
                                    min="0"
                                    name="stock"
                                    value={product.stock}
                                    onChange={handleChange}
                                    placeholder="50"
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles['flash-row']}>
                            <label className={styles['checkbox-label']}>
                                <input
                                    type="checkbox"
                                    name="flash_sale"
                                    checked={product.flash_sale}
                                    onChange={handleChange}
                                />
                                <span>⚡ Feature in Limited-Time Flash Sales</span>
                            </label>

                            {product.flash_sale && (
                                <div className={styles['field']} style={{maxWidth: '240px'}}>
                                    <label>Flash Sale Ends At</label>
                                    <input
                                        type="date"
                                        name="flash_sale_ends_at"
                                        value={product.flash_sale_ends_at}
                                        onChange={handleChange}
                                    />
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* ==================== STEP 4: FARM SELLER & STORAGE ==================== */}
                {currentStep === 4 && (
                    <section className={styles['section-card']}>
                        <div className={styles['sec-head']}>
                            <div>
                                <span className={styles['step-pill']}>STEP 4 OF 5</span>
                                <h2>Seller, Harvest Dates & Storage</h2>
                                <p>
                                    Your verified store details, harvest dates, shelf life, and
                                    storage tips.
                                </p>
                            </div>
                        </div>

                        <div className={styles['row-2']}>
                            <div className={styles['field']}>
                                <label>Seller / Store Name (Verified Account)</label>
                                <input
                                    name="seller_name"
                                    value={product.seller_name}
                                    disabled
                                    style={{background: '#f1f5f9', color: '#475569'}}
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Seller / Dispatch Location</label>
                                <input
                                    name="seller_location"
                                    value={product.seller_location}
                                    onChange={handleChange}
                                    placeholder="Limuru, Kiambu County"
                                />
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Harvest / Packed Date</label>
                                <input
                                    type="date"
                                    name="harvest_date"
                                    value={product.harvest_date}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Best Before / Expiry Date</label>
                                <input
                                    type="date"
                                    name="expiry_date"
                                    value={product.expiry_date}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Shelf Life</label>
                                <input
                                    name="shelf_life"
                                    value={product.shelf_life}
                                    onChange={handleChange}
                                    placeholder="5–7 Days"
                                />
                            </div>
                        </div>

                        <div className={styles['row-2']}>
                            <div className={styles['field']}>
                                <label>Storage Instructions</label>
                                <input
                                    name="storage_tips"
                                    value={product.storage_tips}
                                    onChange={handleChange}
                                    placeholder="Keep refrigerated at 2°C–6°C."
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Tags (Comma-separated)</label>
                                <input
                                    name="tags"
                                    value={product.tags}
                                    onChange={handleChange}
                                    placeholder="Farm Fresh, Organic, Daily Harvest"
                                />
                            </div>
                        </div>
                    </section>
                )}

                {/* ==================== STEP 5: NUTRITION & REVIEW ==================== */}
                {currentStep === 5 && (
                    <section className={styles['section-card']}>
                        <div className={styles['sec-head']}>
                            <div>
                                <span className={styles['step-pill']}>STEP 5 OF 5</span>
                                <h2>Nutritional Information & Final Review</h2>
                                <p>
                                    Verify nutritional macros and review your product summary before{' '}
                                    {isEditMode ? 'saving changes' : 'publishing'}.
                                </p>
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Calories</label>
                                <input
                                    name="calories"
                                    value={product.calories}
                                    onChange={handleChange}
                                    placeholder="45 kcal / 100g"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Protein</label>
                                <input
                                    name="protein"
                                    value={product.protein}
                                    onChange={handleChange}
                                    placeholder="2.8g"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Carbohydrates</label>
                                <input
                                    name="carbs"
                                    value={product.carbs}
                                    onChange={handleChange}
                                    placeholder="8.2g"
                                />
                            </div>
                        </div>

                        <div className={styles['row-3']}>
                            <div className={styles['field']}>
                                <label>Total Fat</label>
                                <input
                                    name="fat"
                                    value={product.fat}
                                    onChange={handleChange}
                                    placeholder="0.4g"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Dietary Fiber</label>
                                <input
                                    name="fiber"
                                    value={product.fiber}
                                    onChange={handleChange}
                                    placeholder="3.6g"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Vitamins & Minerals (Comma-separated)</label>
                                <input
                                    name="vitamins"
                                    value={product.vitamins}
                                    onChange={handleChange}
                                    placeholder="Vitamin A, Vitamin C, Iron"
                                />
                            </div>
                        </div>

                        {/* Admin Approval Notice Before Publishing or Applying Live Edits */}
                        <div
                            style={{
                                background: '#fffbeb',
                                border: '1px solid #fcd34d',
                                color: '#92400e',
                                borderRadius: '14px',
                                padding: '0.8rem 1rem',
                                fontSize: '0.82rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                            }}
                        >
                            <span className="material-symbols-outlined">hourglass_top</span>
                            <span>
                                {isEditMode &&
                                (!editingProduct?.approval_status ||
                                    editingProduct.approval_status === 'APPROVED') ? (
                                    <>
                                        <strong>Admin Approval Required for Edits:</strong> Any
                                        changes to a published product are reviewed by an Admin
                                        first. Shoppers will continue seeing the previous live
                                        details until Admin approves your update.
                                    </>
                                ) : (
                                    <>
                                        <strong>Admin Review Before Publishing:</strong> Your
                                        product will be listed as <b>Pending Publishing</b> while an
                                        Admin reviews it. Once approved, it automatically goes live
                                        on the FreshMart storefront.
                                    </>
                                )}
                            </span>
                        </div>

                        {/* Final Review Summary Box */}
                        <div className={styles['review-summary-card']}>
                            <div className={styles['review-img']}>
                                {mediaItems[0]?.previewUrl ? (
                                    <img src={mediaItems[0].previewUrl} alt={product.name}/>
                                ) : (
                                    <span className="material-symbols-outlined">image</span>
                                )}
                            </div>
                            <div className={styles['review-info']}>
                                <span className={styles['review-cat']}>{product.category}</span>
                                <h3>{product.name || 'Untitled Product'}</h3>
                                <p>
                                    {product.weight || '—'} {product.measurement} • Stock:{' '}
                                    <strong>{product.stock} units</strong> • Gallery:{' '}
                                    <strong>{mediaItems.length} images</strong> • Seller:{' '}
                                    <strong>{product.seller_name}</strong>
                                </p>
                            </div>
                            <div className={styles['review-price']}>
                                <small>Selling Price</small>
                                <strong>{formatKES(calculatedFinalPrice)} KES</strong>
                                {discountPct > 0 && <span>-{discountPct}% Discount Applied</span>}
                            </div>
                        </div>
                    </section>
                )}

                {/* Bottom Wizard Navigation Footer */}
                <div className={styles['wizard-footer']}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem'}}>
                        {currentStep > 1 ? (
                            <button
                                type="button"
                                onClick={handlePrevStep}
                                className={styles['prev-btn']}
                            >
                                <span className="material-symbols-outlined">arrow_back</span>
                                <span>Previous Step</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onCancel}
                                className={styles['prev-btn']}
                            >
                                <span>Cancel</span>
                            </button>
                        )}
                    </div>

                    <span className={styles['step-indicator']}>
                        Step <strong>{currentStep}</strong> of 5
                    </span>

                    <div style={{display: 'flex', alignItems: 'center', gap: '0.6rem'}}>
                        {isEditMode && currentStep < 5 && (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className={styles['prev-btn']}
                            >
                                <span>
                                    {submitting
                                        ? 'Submitting...'
                                        : !editingProduct?.approval_status ||
                                          editingProduct.approval_status === 'APPROVED'
                                        ? 'Submit Edits for Approval'
                                        : 'Save Draft'}
                                </span>
                            </button>
                        )}
                        {currentStep < 5 ? (
                            <button
                                type="button"
                                onClick={handleNextStep}
                                className={`btn1 ${styles['next-btn']}`}
                            >
                                <span>Next Step</span>
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className={`btn1 ${styles['submit']}`}
                            >
                                <span>
                                    {submitting
                                        ? 'Submitting for Review...'
                                        : isEditMode
                                        ? editingProduct?.approval_status === 'REJECTED'
                                            ? 'Resubmit for Admin Review'
                                            : !editingProduct?.approval_status ||
                                              editingProduct.approval_status === 'APPROVED'
                                            ? 'Submit Changes for Admin Approval'
                                            : 'Update Pending Draft'
                                        : 'Submit for Admin Approval'}
                                </span>
                                <span className="material-symbols-outlined">check_circle</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SellerProductWizard;
