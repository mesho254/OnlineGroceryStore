export const getDiscountPercent = (product) => {
    const d = Number(product?.discount || 0);
    return d > 0 && d < 95 ? d : 0;
};

export const getOriginalPrice = (product) => {
    return Number(product?.original_price ?? product?.price ?? 0);
};

export const getEffectivePrice = (product) => {
    const basePrice = getOriginalPrice(product);
    const discount = getDiscountPercent(product);
    if (discount > 0) {
        return Number((basePrice * (1 - discount / 100)).toFixed(2));
    }
    return Number(basePrice.toFixed(2));
};

export const getUnitSavings = (product) => {
    const original = getOriginalPrice(product);
    const effective = getEffectivePrice(product);
    return Number(Math.max(0, original - effective).toFixed(2));
};

export const formatKES = (amount) => {
    return Number(amount || 0).toLocaleString("en-KE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};
