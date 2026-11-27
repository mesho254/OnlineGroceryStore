import dns from "node:dns";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import Products from "./model/Products.js";

dotenv.config({ path: new URL("./.env", import.meta.url) });
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mealDbImg = (ingredient) =>
  `https://www.themealdb.com/images/ingredients/${encodeURIComponent(ingredient)}.png`;

const categoryProfiles = {
  "Fruits and Vegetables": {
    seller: {
      name: "Limuru Highlands Organic Farm",
      verified: true,
      rating: 4.9,
      location: "Limuru, Kiambu County",
    },
    brand: "Highland Harvest Organics",
    origin: "Kiambu & Nyandarua Highlands, Kenya",
    is_organic: true,
    storage_tips: "Keep refrigerated in the crisper drawer at 4°C. Wash thoroughly with clean water before cooking or eating.",
    shelf_life: "5–7 Days",
    nutrition: {
      calories: "45 kcal / 100g",
      protein: "2.8g",
      carbs: "8.2g",
      fat: "0.4g",
      fiber: "3.6g",
      vitamins: ["Vitamin A", "Vitamin C", "Vitamin K", "Iron", "Folate"],
    },
    tags: ["100% Organic", "Daily Harvest", "Pesticide Free", "Farm Direct"],
  },
  "Meat Poultry and Seafood": {
    seller: {
      name: "Prime Cuts & Coastal Catch Kenya",
      verified: true,
      rating: 4.9,
      location: "Nairobi & Kilifi Creek, Kenya",
    },
    brand: "PrimeSelect Butchery",
    origin: "Laikipia Ranches & Kenyan Coast",
    is_organic: true,
    storage_tips: "Keep chilled at 0°C–3°C or freeze immediately at -18°C. Cook thoroughly before serving.",
    shelf_life: "4 Days Chilled / 3 Months Frozen",
    nutrition: {
      calories: "195 kcal / 100g",
      protein: "26.5g",
      carbs: "0g",
      fat: "8.5g",
      fiber: "0g",
      vitamins: ["Vitamin B12", "Iron", "Zinc", "Omega-3"],
    },
    tags: ["Prime Cut", "Cold-Chain Certified", "High Protein", "Hormone Free"],
  },
  "Dairy and Eggs": {
    seller: {
      name: "Naivasha Valley Dairy Co-op",
      verified: true,
      rating: 4.8,
      location: "Naivasha, Nakuru County",
    },
    brand: "ValleyFresh Creamery",
    origin: "Rift Valley Pastures, Kenya",
    is_organic: true,
    storage_tips: "Keep refrigerated at 2°C–5°C at all times. Once opened, consume within 4 days.",
    shelf_life: "10–14 Days",
    nutrition: {
      calories: "145 kcal / 100g",
      protein: "8.4g",
      carbs: "4.8g",
      fat: "7.8g",
      fiber: "0g",
      vitamins: ["Calcium", "Vitamin D", "Vitamin B2", "Phosphorus"],
    },
    tags: ["Pasture Raised", "Rich in Calcium", "Farm Fresh Dairy", "Chilled Delivery"],
  },
  Breakfast: {
    seller: {
      name: "Artisan Pantry & Bakery Nairobi",
      verified: true,
      rating: 4.8,
      location: "Westlands, Nairobi",
    },
    brand: "MorningGold Pantry",
    origin: "Nairobi & Mau Narok, Kenya",
    is_organic: true,
    storage_tips: "Store in an airtight container in a cool, dry cupboard away from direct sunlight.",
    shelf_life: "3–6 Months",
    nutrition: {
      calories: "310 kcal / 100g",
      protein: "10.2g",
      carbs: "54.0g",
      fat: "6.2g",
      fiber: "7.5g",
      vitamins: ["Vitamin B1", "Magnesium", "Dietary Fiber", "Iron"],
    },
    tags: ["Morning Essential", "Wholegrain Energy", "No Artificial Preservatives"],
  },
  Beverages: {
    seller: {
      name: "Mt. Kenya Roasters & Orchards",
      verified: true,
      rating: 4.9,
      location: "Nyeri & Kericho, Kenya",
    },
    brand: "PureSip Kenya",
    origin: "Nyeri & Kericho Highlands, Kenya",
    is_organic: true,
    storage_tips: "Serve chilled. Refrigerate juices after opening and keep coffee/tea sealed in a dry container.",
    shelf_life: "30–180 Days",
    nutrition: {
      calories: "48 kcal / 100ml",
      protein: "0.7g",
      carbs: "11.0g",
      fat: "0.1g",
      fiber: "0.5g",
      vitamins: ["Vitamin C", "Antioxidants", "Potassium"],
    },
    tags: ["100% Natural", "No Added Sugar", "Kenyan Highland Origin"],
  },
  "Chocolate and Candy": {
    seller: {
      name: "SweetCraft Confectionery House",
      verified: true,
      rating: 4.7,
      location: "Karen, Nairobi",
    },
    brand: "CocoaCraft Artisan",
    origin: "East African Cocoa & Confectionery",
    is_organic: false,
    storage_tips: "Store in a cool, dry place between 15°C and 20°C away from heat to prevent melting.",
    shelf_life: "9 Months",
    nutrition: {
      calories: "510 kcal / 100g",
      protein: "6.5g",
      carbs: "56.0g",
      fat: "29.0g",
      fiber: "4.2g",
      vitamins: ["Magnesium", "Iron", "Cocoa Flavonoids"],
    },
    tags: ["Artisan Sweet", "Rich Cocoa", "Treat Yourself"],
  },
  "Chips and Crackers": {
    seller: {
      name: "CrunchTime Snack Co.",
      verified: true,
      rating: 4.8,
      location: "Industrial Area, Nairobi",
    },
    brand: "CrispyKettle Snacks",
    origin: "Nakuru & Nairobi, Kenya",
    is_organic: false,
    storage_tips: "Reseal bag tightly after opening to keep snacks crisp and crunchy.",
    shelf_life: "6 Months",
    nutrition: {
      calories: "485 kcal / 100g",
      protein: "6.8g",
      carbs: "58.0g",
      fat: "24.0g",
      fiber: "4.5g",
      vitamins: ["Potassium", "Vitamin E"],
    },
    tags: ["Kettle Cooked", "Sea Salt", "Party Favorite"],
  },
  "Ice Cream": {
    seller: {
      name: "Frosty Gelato & Creamery",
      verified: true,
      rating: 4.9,
      location: "Lavington, Nairobi",
    },
    brand: "DolceVita Gelato",
    origin: "Nairobi Artisan Creamery",
    is_organic: false,
    storage_tips: "Keep frozen at -18°C or below. Let soften for 3 minutes at room temperature before scooping.",
    shelf_life: "4 Months Frozen",
    nutrition: {
      calories: "215 kcal / 100g",
      protein: "4.2g",
      carbs: "23.5g",
      fat: "11.5g",
      fiber: "0.4g",
      vitamins: ["Calcium", "Vitamin A", "Vitamin B12"],
    },
    tags: ["Real Dairy Cream", "Insulated Cold-Bag Delivery", "Artisan Batch"],
  },
};

const rawProducts = [
  // ==================== 1. Fruits and Vegetables (12 items) ====================
  {
    name: "Fresh Sukuma Wiki (Kale)",
    category: "Fruits and Vegetables",
    price: 50,
    discount: 20,
    flash_sale: true,
    weight: 500,
    measurement: "g",
    stock: 80,
    image: mealDbImg("Kale"),
    description:
      "Crisp, dark-green organic Sukuma Wiki (kale) leaves harvested at dawn from Limuru highland farms. Triple-washed, tender, and packed with iron, calcium, and vitamins A, C, and K—ideal for traditional Kenyan sautéed sukuma wiki, green smoothies, or hearty soups.",
  },
  {
    name: "Fresh Baby Spinach",
    category: "Fruits and Vegetables",
    price: 60,
    discount: 15,
    flash_sale: false,
    weight: 400,
    measurement: "g",
    stock: 75,
    image: mealDbImg("Spinach"),
    description:
      "Tender young baby spinach leaves grown without synthetic pesticides. Naturally rich in folate and iron, perfect for fresh garden salads, creamy garlic spinach sides, omelettes, and nutrient-dense smoothies.",
  },
  {
    name: "Ripe Hass Avocados",
    category: "Fruits and Vegetables",
    price: 120,
    discount: 25,
    flash_sale: true,
    weight: 500,
    measurement: "g",
    stock: 60,
    image: mealDbImg("Avocado"),
    description:
      "Creamy, buttery Kenyan Hass avocados hand-selected for peak ripeness. Loaded with heart-healthy monounsaturated fats, potassium, and fiber—delicious on toast, in guacamole, or sliced alongside nyama choma and kachumbari.",
  },
  {
    name: "Sweet Yellow Bananas",
    category: "Fruits and Vegetables",
    price: 150,
    discount: 10,
    flash_sale: false,
    weight: 1,
    measurement: "kg",
    stock: 90,
    image: mealDbImg("Banana"),
    description:
      "Naturally ripened sweet yellow bananas from Kisii and Meru orchards. A quick source of natural energy, potassium, and vitamin B6 for breakfast bowls, baking banana bread, or healthy school snacks.",
  },
  {
    name: "Fresh Green Broccoli",
    category: "Fruits and Vegetables",
    price: 140,
    discount: 0,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 50,
    image: mealDbImg("Broccoli"),
    description:
      "Compact, vibrant green broccoli crowns harvested crisp from highland farms. Delicious steamed, stir-fried with garlic and ginger, or roasted with olive oil.",
  },
  {
    name: "Vine Ripened Tomatoes",
    category: "Fruits and Vegetables",
    price: 130,
    discount: 15,
    flash_sale: false,
    weight: 1,
    measurement: "kg",
    stock: 100,
    image: mealDbImg("Tomatoes"),
    description:
      "Juicy, sun-ripened red tomatoes bursting with natural lycopene and sweet-tangy flavor. Essential for rich stews, fresh kachumbari salads, pasta sauces, and curries.",
  },
  {
    name: "Crunchy Organic Carrots",
    category: "Fruits and Vegetables",
    price: 110,
    discount: 0,
    flash_sale: false,
    weight: 1,
    measurement: "kg",
    stock: 85,
    image: mealDbImg("Carrots"),
    description:
      "Sweet, crunchy orange carrots grown in rich volcanic highland soil. High in beta-carotene and vitamin A—great for snacking, juicing, roasting, or adding natural sweetness to stews.",
  },
  {
    name: "Fresh Red Onions",
    category: "Fruits and Vegetables",
    price: 140,
    discount: 10,
    flash_sale: false,
    weight: 1,
    measurement: "kg",
    stock: 95,
    image: mealDbImg("Red Onions"),
    description:
      "Aromatic, firm red bulb onions with crisp purple-red layers. Adds depth of flavor to every Kenyan meal, from caramelized onion gravies to raw kachumbari salsa.",
  },
  {
    name: "Farm Fresh Irish Potatoes",
    category: "Fruits and Vegetables",
    price: 220,
    discount: 18,
    flash_sale: true,
    weight: 2,
    measurement: "kg",
    stock: 110,
    image: mealDbImg("Potatoes"),
    description:
      "Clean, versatile Kinangop Irish potatoes with a fluffy interior and thin skin. Ideal for crispy homemade fries, creamy mashed potatoes, mukimo, or hearty beef and potato stew.",
  },
  {
    name: "Fresh Sweet Strawberries",
    category: "Fruits and Vegetables",
    price: 250,
    discount: 20,
    flash_sale: true,
    weight: 250,
    measurement: "g",
    stock: 45,
    image: mealDbImg("Strawberries"),
    description:
      "Ruby-red, fragrant strawberries handpicked at peak sweetness. Enjoy fresh out of the punnet, sliced over Greek yogurt and pancakes, or blended into shakes.",
  },
  {
    name: "Crisp Red Apples",
    category: "Fruits and Vegetables",
    price: 280,
    discount: 0,
    flash_sale: false,
    weight: 1,
    measurement: "kg",
    stock: 70,
    image: mealDbImg("Apples"),
    description:
      "Crunchy, honey-sweet red apples with a refreshing bite. Packed with soluble dietary fiber and antioxidants for everyday healthy snacking.",
  },
  {
    name: "Green Bell Peppers (Hoho)",
    category: "Fruits and Vegetables",
    price: 120,
    discount: 0,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 65,
    image: mealDbImg("Green Pepper"),
    description:
      "Glossy, thick-walled green bell peppers (hoho) that add aromatic crunch and vitamin C to stir-fries, pilau, pizzas, and stews.",
  },

  // ==================== 2. Meat Poultry and Seafood (7 items) ====================
  {
    name: "Boneless Chicken Breast",
    category: "Meat Poultry and Seafood",
    price: 650,
    discount: 15,
    flash_sale: true,
    weight: 500,
    measurement: "g",
    stock: 45,
    image: mealDbImg("Chicken Breast"),
    description:
      "Lean, skinless and boneless free-range chicken breast fillets. Trimmed and ready to pan-sear, grill, bake, or dice into curries, fajitas, and high-protein meal prep bowls.",
  },
  {
    name: "Fresh Chicken Thighs",
    category: "Meat Poultry and Seafood",
    price: 580,
    discount: 10,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 50,
    image: mealDbImg("Chicken Thighs"),
    description:
      "Juicy, flavorful chicken thighs that stay tender during roasting, grilling, or slow-simmering in coconut chicken curry.",
  },
  {
    name: "Fresh Atlantic Salmon Fillet",
    category: "Meat Poultry and Seafood",
    price: 1450,
    discount: 20,
    flash_sale: true,
    weight: 400,
    measurement: "g",
    stock: 30,
    image: mealDbImg("Salmon"),
    description:
      "Sushi-grade Atlantic salmon fillet rich in heart-healthy Omega-3 fatty acids and high-quality protein. Features a buttery texture ideal for pan-searing with lemon-butter or oven roasting.",
  },
  {
    name: "Prime Beef Sirloin Steak",
    category: "Meat Poultry and Seafood",
    price: 850,
    discount: 12,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 40,
    image: mealDbImg("Beef"),
    description:
      "Grass-fed Kenyan beef sirloin aged for tenderness and marbling. Perfect for sizzling steak dinners, nyama choma grilling, or beef stroganoff.",
  },
  {
    name: "Lean Minced Beef",
    category: "Meat Poultry and Seafood",
    price: 620,
    discount: 0,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 55,
    image: mealDbImg("Minced Beef"),
    description:
      "Freshly ground 90% lean beef mince prepared daily. Ideal for homemade gourmet burgers, spaghetti bolognese, samosa fillings, and meatballs.",
  },
  {
    name: "Fresh King Prawns",
    category: "Meat Poultry and Seafood",
    price: 1200,
    discount: 15,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 25,
    image: mealDbImg("King Prawns"),
    description:
      "Wild-caught Indian Ocean king prawns, cleaned and flash-chilled to lock in their sweet maritime flavor. Cooks in minutes with garlic butter, chili, and parsley.",
  },
  {
    name: "Smoked Streaky Bacon",
    category: "Meat Poultry and Seafood",
    price: 550,
    discount: 0,
    flash_sale: false,
    weight: 250,
    measurement: "g",
    stock: 40,
    image: mealDbImg("Bacon"),
    description:
      "Naturally hardwood-smoked streaky bacon rashers that crisp up beautifully in the pan for hearty English breakfasts, burgers, and pasta carbonara.",
  },

  // ==================== 3. Dairy and Eggs (7 items) ====================
  {
    name: "Fresh Whole Cow Milk",
    category: "Dairy and Eggs",
    price: 140,
    discount: 10,
    flash_sale: false,
    weight: 1,
    measurement: "L",
    stock: 120,
    image: mealDbImg("Milk"),
    description:
      "Pasteurized, creamy whole cow milk sourced from pasture-grazed Rift Valley dairy herds. Rich in calcium, protein, and vitamin D—perfect for Kenyan chai, coffee, cereal, and baking.",
  },
  {
    name: "Free-Range Farm Eggs (12 Pack)",
    category: "Dairy and Eggs",
    price: 320,
    discount: 15,
    flash_sale: true,
    weight: 12,
    measurement: "pcs",
    stock: 85,
    image: mealDbImg("Eggs"),
    description:
      "Dozen large free-range farm eggs with bright golden-orange yolks from hens fed a natural grain diet. Collected daily for unbeatable freshness.",
  },
  {
    name: "Creamy Salted Dairy Butter",
    category: "Dairy and Eggs",
    price: 420,
    discount: 0,
    flash_sale: false,
    weight: 250,
    measurement: "g",
    stock: 60,
    image: mealDbImg("Butter"),
    description:
      "Churned from 100% pure sweet cream with a touch of sea salt. Smooth, rich, and golden—ideal for spreading on warm toast, baking flaky pastries, and finishing sauces.",
  },
  {
    name: "Mature Cheddar Cheese Block",
    category: "Dairy and Eggs",
    price: 580,
    discount: 10,
    flash_sale: false,
    weight: 250,
    measurement: "g",
    stock: 45,
    image: mealDbImg("Cheddar Cheese"),
    description:
      "Naturally aged mature cheddar cheese with a sharp, nutty depth and smooth melt. Great for grilled cheese sandwiches, burgers, pasta bakes, and cheese boards.",
  },
  {
    name: "Thick Plain Greek Yogurt",
    category: "Dairy and Eggs",
    price: 290,
    discount: 15,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 55,
    image: mealDbImg("Greek Yogurt"),
    description:
      "Velvety, strained probiotic Greek yogurt packed with live cultures and double the protein of regular yogurt. Enjoy with honey and berries or use in marinades and dips.",
  },
  {
    name: "Fresh Mozzarella Cheese",
    category: "Dairy and Eggs",
    price: 520,
    discount: 0,
    flash_sale: false,
    weight: 250,
    measurement: "g",
    stock: 40,
    image: mealDbImg("Mozzarella"),
    description:
      "Soft, milky artisan mozzarella cheese with superior stretch and melt. Essential for homemade wood-fired style pizzas, lasagnas, and Caprese salads.",
  },
  {
    name: "Heavy Whipping Cream",
    category: "Dairy and Eggs",
    price: 380,
    discount: 0,
    flash_sale: false,
    weight: 500,
    measurement: "ml",
    stock: 35,
    image: mealDbImg("Heavy Cream"),
    description:
      "Rich 36% butterfat dairy whipping cream that whips into stiff, airy peaks for desserts and adds luxurious body to soups and pasta sauces.",
  },

  // ==================== 4. Breakfast (7 items) ====================
  {
    name: "Wholegrain Rolled Oats",
    category: "Breakfast",
    price: 340,
    discount: 15,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 70,
    image: mealDbImg("Rolled Oats"),
    description:
      "100% wholegrain jumbo rolled oats high in soluble beta-glucan fiber for sustained morning energy. Cooks in 5 minutes for creamy porridge or overnight oats.",
  },
  {
    name: "Pure Organic Acacia Honey",
    category: "Breakfast",
    price: 550,
    discount: 20,
    flash_sale: true,
    weight: 500,
    measurement: "g",
    stock: 50,
    image: mealDbImg("Honey"),
    description:
      "Raw, unfiltered golden honey harvested from wild acacia blossoms in Baringo and Kitui. Naturally antibacterial and delicious drizzled over pancakes, tea, and yogurt.",
  },
  {
    name: "Creamy Roasted Peanut Butter",
    category: "Breakfast",
    price: 360,
    discount: 10,
    flash_sale: false,
    weight: 400,
    measurement: "g",
    stock: 65,
    image: mealDbImg("Peanut Butter"),
    description:
      "Stone-ground from slow-roasted high-oleic peanuts with zero palm oil or added sugar. Packed with plant protein and healthy fats.",
  },
  {
    name: "Fresh Sliced White Bread",
    category: "Breakfast",
    price: 90,
    discount: 0,
    flash_sale: false,
    weight: 400,
    measurement: "g",
    stock: 100,
    image: mealDbImg("Bread"),
    description:
      "Soft, oven-fresh pillowy sliced white loaf baked early every morning. Perfect for golden buttered toast and lunchtime sandwiches.",
  },
  {
    name: "Strawberry Fruit Jam",
    category: "Breakfast",
    price: 280,
    discount: 0,
    flash_sale: false,
    weight: 350,
    measurement: "g",
    stock: 55,
    image: mealDbImg("Raspberry Jam"),
    description:
      "Small-batch fruit preserve bursting with real highland berries and natural pectin. Spread generously on scones, croissants, and toast.",
  },
  {
    name: "French Butter Croissants (4 Pack)",
    category: "Breakfast",
    price: 380,
    discount: 15,
    flash_sale: false,
    weight: 240,
    measurement: "g",
    stock: 35,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Croissant-Petr_Kratochvil.jpg/330px-Croissant-Petr_Kratochvil.jpg",
    description:
      "Flaky, golden-layered all-butter French croissants baked fresh each morning with 27 delicate laminated pastry layers.",
  },
  {
    name: "Crunchy Breakfast Corn Flakes",
    category: "Breakfast",
    price: 420,
    discount: 10,
    flash_sale: false,
    weight: 500,
    measurement: "g",
    stock: 60,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Kellogg%27s_Corn_Flakes%2C_with_milk.jpg/330px-Kellogg%27s_Corn_Flakes%2C_with_milk.jpg",
    description:
      "Golden toasted corn flakes fortified with 8 essential B-vitamins and iron for a crisp, quick family breakfast with cold or warm milk.",
  },

  // ==================== 5. Beverages (5 items) ====================
  {
    name: "Fresh Squeezed Orange Juice",
    category: "Beverages",
    price: 320,
    discount: 15,
    flash_sale: false,
    weight: 1,
    measurement: "L",
    stock: 65,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Orangejuice.jpg/330px-Orangejuice.jpg",
    description:
      "100% pure cold-pressed Valencia orange juice with natural pulp and zero added sugar or water. Packed with daily Vitamin C.",
  },
  {
    name: "100% Pressed Apple Juice",
    category: "Beverages",
    price: 310,
    discount: 0,
    flash_sale: false,
    weight: 1,
    measurement: "L",
    stock: 60,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Apfelsaft_im_Glas.jpg/330px-Apfelsaft_im_Glas.jpg",
    description:
      "Crisp, refreshing pressed orchard apple juice made from whole sweet apples with no artificial sweeteners or preservatives.",
  },
  {
    name: "Kenyan AA Roasted Ground Coffee",
    category: "Beverages",
    price: 680,
    discount: 20,
    flash_sale: true,
    weight: 250,
    measurement: "g",
    stock: 50,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Roasted_coffee_beans.jpg/330px-Roasted_coffee_beans.jpg",
    description:
      "Single-origin Kenyan AA Arabica coffee grown on the volcanic slopes of Mt. Kenya. Medium-dark roasted for bright berry notes, rich crema, and a chocolatey finish.",
  },
  {
    name: "Premium Kenyan Black Tea Leaves",
    category: "Beverages",
    price: 240,
    discount: 0,
    flash_sale: false,
    weight: 250,
    measurement: "g",
    stock: 80,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Cup_of_black_tea.JPG/330px-Cup_of_black_tea.JPG",
    description:
      "Finest upper-leaf Kericho CTC black tea offering a brisk, malty aroma and rich golden-amber liquor—the heart of authentic Kenyan masala chai.",
  },
  {
    name: "Natural Organic Coconut Milk Drink",
    category: "Beverages",
    price: 290,
    discount: 10,
    flash_sale: false,
    weight: 400,
    measurement: "ml",
    stock: 45,
    image: mealDbImg("Coconut Milk"),
    description:
      "Creamy coastal coconut milk pressed from fresh mature coconuts. Dairy-free and vegan—perfect for smoothies, iced lattes, and Swahili coconut curries.",
  },

  // ==================== 6. Chocolate and Candy (4 items) ====================
  {
    name: "70% Cocoa Dark Chocolate Bar",
    category: "Chocolate and Candy",
    price: 350,
    discount: 15,
    flash_sale: false,
    weight: 100,
    measurement: "g",
    stock: 70,
    image: mealDbImg("Dark Chocolate"),
    description:
      "Velvety 70% single-origin dark chocolate bar crafted from slow-conched cocoa beans. Rich in antioxidants with deep roasted cacao notes.",
  },
  {
    name: "Creamy Milk Chocolate Bar",
    category: "Chocolate and Candy",
    price: 280,
    discount: 10,
    flash_sale: false,
    weight: 100,
    measurement: "g",
    stock: 85,
    image: mealDbImg("Milk Chocolate"),
    description:
      "Silky alpine-style milk chocolate blended with whole dairy cream and pure cocoa butter for an irresistibly smooth melt.",
  },
  {
    name: "Mini Marshmallows Pack",
    category: "Chocolate and Candy",
    price: 220,
    discount: 0,
    flash_sale: false,
    weight: 150,
    measurement: "g",
    stock: 50,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/White_Marshmallows.jpg/330px-White_Marshmallows.jpg",
    description:
      "Fluffy vanilla-infused mini marshmallows—perfect for topping mugs of hot chocolate, baking rocky road bars, or roasting.",
  },
  {
    name: "Fruity Gummy Bears Candy",
    category: "Chocolate and Candy",
    price: 190,
    discount: 0,
    flash_sale: false,
    weight: 150,
    measurement: "g",
    stock: 65,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Oursons_g%C3%A9latine_march%C3%A9_Rouffignac.jpg/330px-Oursons_g%C3%A9latine_march%C3%A9_Rouffignac.jpg",
    description:
      "Chewy, bite-sized fruit gummy bears made with real fruit juice concentrates in strawberry, orange, lemon, pineapple, and raspberry flavors.",
  },

  // ==================== 7. Chips and Crackers (4 items) ====================
  {
    name: "Classic Sea Salt Potato Chips",
    category: "Chips and Crackers",
    price: 210,
    discount: 15,
    flash_sale: false,
    weight: 150,
    measurement: "g",
    stock: 90,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Potato-Chips.jpg/330px-Potato-Chips.jpg",
    description:
      "Thinly sliced highland potatoes kettle-cooked in pure sunflower oil and lightly dusted with Indian Ocean sea salt crystals.",
  },
  {
    name: "Crispy Corn Tortilla Nacho Chips",
    category: "Chips and Crackers",
    price: 260,
    discount: 10,
    flash_sale: false,
    weight: 200,
    measurement: "g",
    stock: 75,
    image: mealDbImg("Tortillas"),
    description:
      "Stone-ground golden corn tortilla triangles baked and crisped to perfection—ideal for dipping into fresh guacamole, salsa, or melted queso.",
  },
  {
    name: "Salted Buttered Popcorn",
    category: "Chips and Crackers",
    price: 160,
    discount: 0,
    flash_sale: false,
    weight: 120,
    measurement: "g",
    stock: 80,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Popcorn_-_Studio_-_2011.jpg/330px-Popcorn_-_Studio_-_2011.jpg",
    description:
      "Airy butterfly popcorn kernels popped light and tumbled with real creamery butter and a pinch of fine sea salt.",
  },
  {
    name: "Crunchy Salted Baked Pretzels",
    category: "Chips and Crackers",
    price: 230,
    discount: 0,
    flash_sale: false,
    weight: 175,
    measurement: "g",
    stock: 55,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/BrezelnSalz02_%28cropped%29.JPG/330px-BrezelnSalz02_%28cropped%29.JPG",
    description:
      "Oven-baked Bavarian-style knotted pretzels with a mahogany crust and coarse salt crunch—low in fat and great with dips.",
  },

  // ==================== 8. Ice Cream (4 items) ====================
  {
    name: "Classic Vanilla Bean Ice Cream",
    category: "Ice Cream",
    price: 550,
    discount: 20,
    flash_sale: true,
    weight: 500,
    measurement: "ml",
    stock: 40,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Vanilla_Ice_Cream_Cone_at_Camp_Manitoulin.jpg/330px-Vanilla_Ice_Cream_Cone_at_Camp_Manitoulin.jpg",
    description:
      "Ultra-creamy artisan ice cream churned with fresh Naivasha dairy cream and speckled with real Bourbon Madagascar vanilla bean seeds.",
  },
  {
    name: "Belgian Chocolate Ice Cream Tub",
    category: "Ice Cream",
    price: 580,
    discount: 15,
    flash_sale: false,
    weight: 500,
    measurement: "ml",
    stock: 45,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Ice_cream_cone_%28cropped%29.jpg/330px-Ice_cream_cone_%28cropped%29.jpg",
    description:
      "Decadent chocolate ice cream crafted with melted Belgian dark chocolate and ribbons of rich fudge.",
  },
  {
    name: "Real Strawberry Swirl Ice Cream",
    category: "Ice Cream",
    price: 560,
    discount: 0,
    flash_sale: false,
    weight: 500,
    measurement: "ml",
    stock: 35,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Strawberry_ice_cream_cone_%285076899310%29.jpg/330px-Strawberry_ice_cream_cone_%285076899310%29.jpg",
    description:
      "Sweet cream ice cream folded with crushed sun-ripened highland strawberries and a vibrant berry compote swirl.",
  },
  {
    name: "Italian Pistachio Gelato Ice Cream",
    category: "Ice Cream",
    price: 650,
    discount: 10,
    flash_sale: false,
    weight: 500,
    measurement: "ml",
    stock: 30,
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Delicious_Gelato_on_display.jpg/330px-Delicious_Gelato_on_display.jpg",
    description:
      "Slow-churned Italian-style pistachio gelato made with roasted pistachio paste and topped with toasted nut pieces.",
  },
];

async function seedProducts() {
  try {
    const now = Date.now();
    const flashSaleEnd = new Date(now + 18 * 60 * 60 * 1000); // 18 hours from now

    const preparedProducts = rawProducts.map((item, idx) => {
      const profile = categoryProfiles[item.category] || categoryProfiles["Fruits and Vegetables"];
      const discount = Number(item.discount || 0);
      const discountedPrice =
        discount > 0
          ? Number((item.price * (1 - discount / 100)).toFixed(2))
          : Number(item.price.toFixed(2));

      const harvestDate = new Date(now - (idx % 3) * 24 * 60 * 60 * 1000);
      const expiryDays = item.category === "Fruits and Vegetables" ? 7 : item.category === "Dairy and Eggs" ? 14 : 90;
      const expiryDate = new Date(now + expiryDays * 24 * 60 * 60 * 1000);

      const sampleReviews = [
        {
          user_name: "Wanjiku M.",
          product_rating: 5,
          seller_rating: 5,
          comment: `Super fresh ${item.name}! Arrived in under 20 minutes and the quality from ${profile.seller.name} is top-notch.`,
          verified_purchase: true,
          created_at: new Date(now - 2 * 24 * 60 * 60 * 1000),
        },
        {
          user_name: "Brian O.",
          product_rating: idx % 3 === 0 ? 5 : 4,
          seller_rating: 5,
          comment: `Great value for money and very well packaged. Will definitely reorder on my next weekly grocery run.`,
          verified_purchase: true,
          created_at: new Date(now - 5 * 24 * 60 * 60 * 1000),
        },
      ];

      const exactExtraImagesMap = {
        "Fresh Sukuma Wiki (Kale)": [
          mealDbImg("Kale"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Kale-Bundle.jpg/330px-Kale-Bundle.jpg",
        ],
        "Fresh Baby Spinach": [
          mealDbImg("Spinach"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Spinacia_oleracea_Spinazie_bloeiend.jpg/330px-Spinacia_oleracea_Spinazie_bloeiend.jpg",
        ],
        "Ripe Hass Avocados": [
          mealDbImg("Avocado"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Avocado_Hass_-_single_and_halved.jpg/330px-Avocado_Hass_-_single_and_halved.jpg",
        ],
        "Sweet Yellow Bananas": [
          mealDbImg("Banana"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/330px-Banana-Single.jpg",
        ],
        "Fresh Green Broccoli": [
          mealDbImg("Broccoli"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Broccoli_and_cross_section_edit.jpg/330px-Broccoli_and_cross_section_edit.jpg",
        ],
        "Vine Ripened Tomatoes": [
          mealDbImg("Tomatoes"),
          mealDbImg("Plum Tomatoes"),
          mealDbImg("Cherry Tomatoes"),
        ],
        "Crunchy Organic Carrots": [
          mealDbImg("Carrots"),
          mealDbImg("Chopped Carrots"),
        ],
        "Fresh Red Onions": [
          mealDbImg("Red Onions"),
          mealDbImg("Onions"),
          mealDbImg("Chopped Onion"),
        ],
        "Farm Fresh Irish Potatoes": [
          mealDbImg("Potatoes"),
          mealDbImg("Small Potatoes"),
          mealDbImg("Floury Potatoes"),
        ],
        "Fresh Sweet Strawberries": [
          mealDbImg("Strawberries"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg/330px-Garden_strawberry_%28Fragaria_%C3%97_ananassa%29_single2.jpg",
        ],
        "Crisp Red Apples": [
          mealDbImg("Apples"),
          "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/330px-Red_Apple.jpg",
        ],
        "Green Bell Peppers (Hoho)": [
          mealDbImg("Green Pepper"),
          mealDbImg("Red Pepper"),
          mealDbImg("Yellow Pepper"),
        ],
        "Boneless Chicken Breast": [
          mealDbImg("Chicken Breast"),
          mealDbImg("Chicken"),
          mealDbImg("Diced Chicken"),
        ],
        "Fresh Chicken Thighs": [
          mealDbImg("Chicken Thighs"),
          mealDbImg("Chicken Legs"),
          mealDbImg("Chicken"),
        ],
        "Fresh Atlantic Salmon Fillet": [
          mealDbImg("Salmon"),
          mealDbImg("Smoked Salmon"),
        ],
        "Prime Beef Sirloin Steak": [
          mealDbImg("Beef"),
          mealDbImg("Beef Fillet"),
          mealDbImg("Beef Brisket"),
        ],
        "Lean Minced Beef": [
          mealDbImg("Minced Beef"),
          mealDbImg("Beef"),
        ],
        "Fresh King Prawns": [
          mealDbImg("King Prawns"),
          mealDbImg("Raw King Prawns"),
          mealDbImg("Tiger Prawns"),
        ],
        "Smoked Streaky Bacon": [
          mealDbImg("Bacon"),
          mealDbImg("Back Bacon"),
        ],
        "Fresh Whole Cow Milk": [
          mealDbImg("Milk"),
          mealDbImg("Semi-Skimmed Milk"),
          mealDbImg("Whole Milk"),
        ],
        "Free-Range Farm Eggs (12 Pack)": [
          mealDbImg("Eggs"),
          mealDbImg("Free-range Eggs"),
          mealDbImg("Free-range Egg"),
        ],
        "Creamy Salted Dairy Butter": [
          mealDbImg("Butter"),
          mealDbImg("Salted Butter"),
          mealDbImg("Unsalted Butter"),
        ],
        "Mature Cheddar Cheese Block": [
          mealDbImg("Cheddar Cheese"),
          mealDbImg("Cheese"),
          mealDbImg("Grated Cheese"),
        ],
        "Thick Plain Greek Yogurt": [
          mealDbImg("Greek Yogurt"),
          mealDbImg("Full Fat Yogurt"),
          mealDbImg("Natural Yoghurt"),
        ],
        "Fresh Mozzarella Cheese": [
          mealDbImg("Mozzarella"),
          mealDbImg("Mozzarella Balls"),
        ],
        "Heavy Whipping Cream": [
          mealDbImg("Heavy Cream"),
          mealDbImg("Double Cream"),
          mealDbImg("Single Cream"),
        ],
        "Wholegrain Rolled Oats": [
          mealDbImg("Rolled Oats"),
          mealDbImg("Oats"),
          mealDbImg("Oatmeal"),
        ],
        "Pure Organic Acacia Honey": [
          mealDbImg("Honey"),
          mealDbImg("Clear Honey"),
        ],
        "Creamy Roasted Peanut Butter": [
          mealDbImg("Peanut Butter"),
          mealDbImg("Peanuts"),
        ],
        "Fresh Sliced White Bread": [
          mealDbImg("Bread"),
          mealDbImg("Wholegrain Bread"),
          mealDbImg("Crusty Bread"),
        ],
        "70% Cocoa Dark Chocolate Bar": [
          mealDbImg("Dark Chocolate"),
          mealDbImg("Plain Chocolate"),
          mealDbImg("Dark Chocolate Chips"),
        ],
        "Creamy Milk Chocolate Bar": [
          mealDbImg("Milk Chocolate"),
          mealDbImg("Chocolate Chips"),
        ],
      };

      const galleryImages = Array.from(
        new Set([item.image, ...(exactExtraImagesMap[item.name] || [])].filter(Boolean))
      );

      return {
        product_id: uuidv4(),
        name: item.name,
        description: item.description,
        category: item.category,
        price: item.price,
        discount,
        discounted_price: discountedPrice,
        flash_sale: Boolean(item.flash_sale),
        flash_sale_ends_at: item.flash_sale ? flashSaleEnd : null,
        weight: item.weight,
        measurement: item.measurement,
        stock: item.stock,
        image: item.image,
        images: galleryImages,
        brand: profile.brand,
        sku: `FM-${item.category.slice(0, 2).toUpperCase()}-${String(idx + 1).padStart(3, "0")}`,
        origin: profile.origin,
        is_organic: profile.is_organic,
        rating: Number((4.6 + ((idx * 7) % 4) * 0.1).toFixed(1)),
        reviews_count: sampleReviews.length,
        reviews: sampleReviews,
        seller: profile.seller,
        nutrition: profile.nutrition,
        storage_tips: profile.storage_tips,
        shelf_life: profile.shelf_life,
        tags: item.flash_sale
          ? ["⚡ Flash Sale", ...profile.tags]
          : discount > 0
          ? [`-${discount}% Deal`, ...profile.tags]
          : profile.tags,
        harvest_date: harvestDate,
        expiry_date: expiryDate,
        created_at: harvestDate,
      };
    });

    console.log("Connecting to MongoDB...");
    mongoose.set("strictQuery", true);
    await mongoose.connect(process.env.CONNECTION_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB.");

    await Products.deleteMany({});
    await Products.insertMany(preparedProducts);

    const count = await Products.countDocuments();
    console.log(`Successfully seeded ${count} enriched products (with descriptions, discounts, flash sales, sellers & nutrition) into MongoDB!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seedProducts();
