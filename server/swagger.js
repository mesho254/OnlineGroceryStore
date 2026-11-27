const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Online Grocery Store API",
    version: "1.0.0",
    description:
      "REST API documentation for the Online Grocery Store backend (Products, Authentication, Wishlist, Cart, Stripe Checkout Payments, Orders, Shipping, and Notifications).",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local Development Server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter JWT token returned from `/api/v1/login`",
      },
    },
    schemas: {
      Address: {
        type: "object",
        properties: {
          country: { type: "string", example: "Kenya" },
          city: { type: "string", example: "Nairobi" },
          area: { type: "string", example: "Westlands" },
          street: { type: "string", example: "Waiyaki Way" },
          building_number: { type: "string", example: "12" },
          floor: { type: "string", example: "3" },
          apartment_number: { type: "string", example: "4B" },
        },
      },
      Product: {
        type: "object",
        properties: {
          product_id: { type: "string", example: "d290f1ee-6c54-4b01-90e6-d701748f0851" },
          name: { type: "string", example: "Fresh Milk" },
          price: { type: "number", example: 120 },
          weight: { type: "number", example: 1 },
          measurement: { type: "string", example: "L" },
          category: { type: "string", example: "Dairy & Eggs" },
          image: { type: "string", example: "https://res.cloudinary.com/demo/image/upload/sample.jpg" },
          stock: { type: "integer", example: 50 },
        },
      },
      CartItemInput: {
        type: "object",
        required: ["product_id", "quantity"],
        properties: {
          product_id: { type: "string", example: "d290f1ee-6c54-4b01-90e6-d701748f0851" },
          name: { type: "string", example: "Fresh Milk" },
          price: { type: "number", example: 120 },
          quantity: { type: "integer", example: 2 },
        },
      },
      CustomerCheckoutData: {
        type: "object",
        required: ["name", "email", "phone_number", "address"],
        properties: {
          name: {
            type: "object",
            properties: {
              first: { type: "string", example: "Meshak" },
              last: { type: "string", example: "Otieno" },
            },
          },
          email: { type: "string", format: "email", example: "meshak@example.com" },
          phone_number: { type: "string", example: "0712345678" },
          address: { $ref: "#/components/schemas/Address" },
        },
      },
      Order: {
        type: "object",
        properties: {
          order_id: { type: "string", example: "AbCdEf" },
          name: {
            type: "object",
            properties: {
              first: { type: "string", example: "Meshak" },
              last: { type: "string", example: "Otieno" },
            },
          },
          email: { type: "string", example: "meshak@example.com" },
          phone_number: { type: "string", example: "0712345678" },
          address: { $ref: "#/components/schemas/Address" },
          ordered_at: { type: "string", format: "date-time" },
          status: {
            type: "string",
            enum: ["CREATED", "PROCESSING", "FULFILLED", "CANCELLED"],
            example: "CREATED",
          },
          products: {
            type: "array",
            items: { $ref: "#/components/schemas/CartItemInput" },
          },
          total: { type: "number", example: 240 },
        },
      },
      Shipment: {
        type: "object",
        properties: {
          order_id: { type: "string", example: "AbCdEf" },
          total: { type: "number", example: 240 },
          address: { $ref: "#/components/schemas/Address" },
          status: {
            type: "string",
            enum: ["CREATED", "SHIPPED", "DELIVERED", "RETURNED"],
            example: "CREATED",
          },
          ordered_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["General"],
        summary: "Health check and developer team info",
        responses: {
          200: {
            description: "Server is running",
          },
        },
      },
    },
    "/api/v1/login": {
      post: {
        tags: ["Authentication"],
        summary: "Log in with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "user@example.com" },
                  password: { type: "string", format: "password", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Authenticated successfully" },
          400: { description: "Missing credentials" },
          401: { description: "Invalid email or password" },
        },
      },
    },
    "/api/v1/signup": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  first_name: { type: "string", example: "Meshak" },
                  last_name: { type: "string", example: "Otieno" },
                  email: { type: "string", format: "email", example: "user@example.com" },
                  password: { type: "string", format: "password", example: "password123" },
                  phone: { type: "string", example: "0712345678" },
                  role: { type: "string", enum: ["USER", "ADMIN"], default: "USER" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "User registered successfully" },
          400: { description: "User already exists or invalid payload" },
        },
      },
    },
    "/api/v1/forgot-password": {
      post: {
        tags: ["Authentication"],
        summary: "Send a password reset link to the user's email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email", example: "user@example.com" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Password reset link sent" },
          404: { description: "User email not found" },
        },
      },
    },
    "/api/v1/reset-password/{token}": {
      post: {
        tags: ["Authentication"],
        summary: "Reset user password using token from email",
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Password reset token from email link",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  password: { type: "string", format: "password", example: "NewStrongPass123!" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Password reset successfully" },
          400: { description: "Invalid or expired reset token" },
        },
      },
    },
    "/api/v1/verify": {
      post: {
        tags: ["Authentication"],
        summary: "Verify JWT token and return current user profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Current user profile" },
          401: { description: "Unauthorized" },
          404: { description: "User not found" },
        },
      },
    },
    "/api/v1/role": {
      post: {
        tags: ["Authentication"],
        summary: "Verify if a user has a specific role",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id", "role"],
                properties: {
                  id: { type: "string", example: "64a1b2c3d4e5f67890123456" },
                  role: { type: "string", enum: ["USER", "ADMIN"], example: "ADMIN" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Role verified" },
          401: { description: "Unauthorized role" },
          404: { description: "User not found" },
        },
      },
    },
    "/api/v1/wishlist": {
      get: {
        tags: ["Wishlist"],
        summary: "Get current user's wishlist products",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Array of wishlist products",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Product" },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
      patch: {
        tags: ["Wishlist"],
        summary: "Toggle a product in the current user's wishlist",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["product_id"],
                properties: {
                  product_id: { type: "string", example: "d290f1ee-6c54-4b01-90e6-d701748f0851" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Updated wishlist array" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/products": {
      get: {
        tags: ["Products"],
        summary: "Get paginated products (optionally filtered by category)",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "category",
            in: "query",
            schema: { type: "string" },
            description: "Category name filter",
          },
        ],
        responses: {
          200: { description: "Paginated products list" },
        },
      },
      post: {
        tags: ["Products"],
        summary: "Create a new product (supports image upload via multipart/form-data)",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["name", "price", "category"],
                properties: {
                  name: { type: "string", example: "Organic Bananas" },
                  price: { type: "number", example: 150 },
                  weight: { type: "number", example: 1 },
                  measurement: { type: "string", example: "kg" },
                  category: { type: "string", example: "Fruits & Vegetables" },
                  stock: { type: "integer", example: 40 },
                  image: { type: "string", format: "binary" },
                },
              },
            },
            "application/json": {
              schema: { $ref: "#/components/schemas/Product" },
            },
          },
        },
        responses: {
          201: { description: "Created product" },
          409: { description: "Conflict or creation error" },
        },
      },
      patch: {
        tags: ["Products"],
        summary: "Admin bulk update or regenerate products from CSV",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["csv", "mode"],
                properties: {
                  csv: { type: "string", description: "CSV content string" },
                  mode: { type: "string", enum: ["UPDATE", "REGENERATE"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Products updated" },
          400: { description: "Invalid mode or CSV" },
        },
      },
    },
    "/products/recommendations": {
      get: {
        tags: ["Products"],
        summary: "Get product recommendations from 2 random categories",
        responses: {
          200: { description: "Recommended products grouped by category" },
        },
      },
    },
    "/products/flash-sales": {
      get: {
        tags: ["Products"],
        summary: "Get active flash sale and discounted products",
        responses: {
          200: { description: "Array of flash sale products" },
        },
      },
    },
    "/products/{id}": {
      get: {
        tags: ["Products"],
        summary: "Get full product details by product_id (including discount calculations, seller, nutrition, and related products)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Product ID (UUID)",
          },
        ],
        responses: {
          200: { description: "Full product details object" },
          404: { description: "Product not found" },
        },
      },
    },
    "/products/{id}/reviews": {
      post: {
        tags: ["Products"],
        summary: "Submit a product & seller rating and review",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Product ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["product_rating"],
                properties: {
                  product_rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
                  seller_rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
                  comment: { type: "string", example: "Super fresh kale and fast delivery!" },
                  order_id: { type: "string", example: "AbCdEf" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Review submitted and average ratings updated" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/products/search": {
      get: {
        tags: ["Products"],
        summary: "Search products by name",
        parameters: [
          {
            name: "search",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Search keyword",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
        ],
        responses: {
          200: { description: "Matching products" },
        },
      },
    },
    "/products/cart": {
      post: {
        tags: ["Products"],
        summary: "Validate cart items and generate checkout JWT token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cart"],
                properties: {
                  cart: {
                    type: "array",
                    items: { $ref: "#/components/schemas/CartItemInput" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Validated cart and checkout JWT token" },
          400: { description: "Out of stock or insufficient quantity" },
          404: { description: "Product not found" },
        },
      },
    },
    "/products/arr": {
      post: {
        tags: ["Products"],
        summary: "Fetch multiple products by array of product_ids",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["arr"],
                properties: {
                  arr: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Array of matching products" },
        },
      },
    },
    "/products/updateQuantity": {
      patch: {
        tags: ["Products"],
        summary: "Decrement stock quantities for purchased products",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["products"],
                properties: {
                  products: {
                    type: "array",
                    items: { $ref: "#/components/schemas/CartItemInput" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Stock updated" },
        },
      },
    },
    "/payments": {
      post: {
        tags: ["Payments"],
        summary: "Create a modern Stripe Checkout Session (no webhook required)",
        description:
          "Accepts either a `token` from `/products/cart` or a direct `products` array, creates a Stripe Checkout Session, and persists the order & shipment immediately so checkout works without requiring a Stripe webhook.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["data"],
                properties: {
                  token: {
                    type: "string",
                    description: "JWT token returned by `POST /products/cart` (optional if `products` is provided directly)",
                  },
                  products: {
                    type: "array",
                    description: "Direct products array fallback when testing without a cart token",
                    items: { $ref: "#/components/schemas/CartItemInput" },
                  },
                  total: {
                    type: "number",
                    example: 240,
                    description: "Optional total amount fallback when `products` is passed directly",
                  },
                  data: { $ref: "#/components/schemas/CustomerCheckoutData" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Stripe Checkout Session URL and created order ID",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", example: "https://checkout.stripe.com/c/pay/cs_test_..." },
                    sessionId: { type: "string", example: "cs_test_..." },
                    order_id: { type: "string", example: "AbCdEf" },
                  },
                },
              },
            },
          },
          500: { description: "Stripe error or invalid token" },
        },
      },
    },
    "/payments/session/{sessionId}": {
      get: {
        tags: ["Payments"],
        summary: "Verify a Stripe Checkout Session directly via Stripe API",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Stripe Checkout Session ID (`cs_test_...`)",
          },
        ],
        responses: {
          200: { description: "Session status and payment details from Stripe" },
          404: { description: "Session not found" },
        },
      },
    },
    "/orders": {
      get: {
        tags: ["Orders"],
        summary: "Get all orders (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
        ],
        responses: {
          200: { description: "Paginated orders" },
          401: { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Orders"],
        summary: "Create a new order directly",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      order_id: { type: "string", example: "AbCdEf" },
                      firstName: { type: "string", example: "Meshak" },
                      lastName: { type: "string", example: "Otieno" },
                      email: { type: "string", example: "meshak@example.com" },
                      phone_number: { type: "string", example: "0712345678" },
                      address: { $ref: "#/components/schemas/Address" },
                      products: {
                        type: "array",
                        items: { $ref: "#/components/schemas/CartItemInput" },
                      },
                      total: { type: "number", example: 240 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Order created" },
        },
      },
    },
    "/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get an order by order_id",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Order ID",
          },
        ],
        responses: {
          200: { description: "Order details with product details" },
          404: { description: "Order does not exist" },
        },
      },
      patch: {
        tags: ["Orders"],
        summary: "Update order status (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: ["CREATED", "PROCESSING", "FULFILLED", "CANCELLED"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated order" },
          400: { description: "Invalid status" },
          404: { description: "Order does not exist" },
        },
      },
    },
    "/shipping/pickup-stations": {
      get: {
        tags: ["Shipping"],
        summary: "Get all configured pickup stations",
        responses: {
          200: { description: "Array of pickup stations with coordinates and hours" },
        },
      },
      post: {
        tags: ["Shipping"],
        summary: "Create a new pickup station (Admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "area", "street"],
                properties: {
                  name: { type: "string", example: "FreshMart Westlands Hub" },
                  city: { type: "string", example: "Nairobi" },
                  area: { type: "string", example: "Westlands" },
                  street: { type: "string", example: "Karuna Road" },
                  landmark: { type: "string", example: "Opposite Sarit Centre" },
                  phone: { type: "string", example: "0711 234 501" },
                  opening_hours: { type: "string", example: "Mon–Sun: 7:00 AM – 9:30 PM" },
                  lat: { type: "number", example: -1.2615 },
                  lng: { type: "number", example: 36.8021 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Pickup station created" },
        },
      },
    },
    "/shipping": {
      get: {
        tags: ["Shipping"],
        summary: "Get paginated shipments (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
        ],
        responses: {
          200: { description: "Paginated shipments" },
        },
      },
      post: {
        tags: ["Shipping"],
        summary: "Create a shipment record",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Shipment" },
            },
          },
        },
        responses: {
          200: { description: "Shipment created" },
        },
      },
    },
    "/shipping/{id}": {
      get: {
        tags: ["Shipping"],
        summary: "Get shipment by order_id",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Shipment details" },
          400: { description: "Invalid order id" },
        },
      },
      patch: {
        tags: ["Shipping"],
        summary: "Update shipment status (Admin)",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: ["CREATED", "SHIPPED", "DELIVERED", "RETURNED"],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated shipment" },
        },
      },
    },
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Get in-app notifications for the current user (including pending post-delivery review prompts)",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "User notifications list, unread count, and pending review notification" },
        },
      },
    },
    "/notifications/read-all": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "All notifications marked as read" },
        },
      },
    },
    "/notifications/{id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark a specific notification as read or dismiss its popup",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Updated notification" },
        },
      },
    },
    "/notifications/order-confirmation": {
      post: {
        tags: ["Notifications"],
        summary: "Send an order confirmation email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["to", "order"],
                properties: {
                  to: { type: "string", format: "email" },
                  order: { $ref: "#/components/schemas/Order" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Email sent" },
        },
      },
    },
  },
};

export default swaggerSpec;
