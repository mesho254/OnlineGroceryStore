# 🐰 Online Grocery Store

Online Grocery Store is a new System that guarantees delivery within 20 minutes of specified locations. 

## Screenshots
![Landing Page](https://i.ibb.co/sR92dH4/Screenshot-24.png)
![Products Page](https://i.ibb.co/T2jh3B5/Screenshot-25.png)
![Login Page](https://i.ibb.co/H4jvt9K/Screenshot-26.png)


## Tech Stack

| Frontend     | Backend      |
|:-------------|:-------------|
| React        | Node.js      |
| React Router | Express.js   |
| Redux        | MongoDB      |
| Axios        | Stripe       |
|              | SendGrid     |

## Usage


### Client Side

```bash
$ cd client   # go to the client folder
$ npm i       # install packages
$ npm start   # run the client side statically with react-scripts
```

### Server Side

Create a `.env` file in the server directory and insert the following code. Replace the values with your credentials.

```dotenv
# DATABASE CONNECTIVITY
CONNECTION_URL=

# JWT SECTION
JWT_SECRET_KEY =
JWT_AUTH_TTL = 
JWT_CHECKOUT_TTL = 

# EMAIL SECRETS
SENDGRID_KEY = 

# PAYMENT SECRETS
STRIPE_PRIVATE_KEY = 
```

Start the server

```bash
$ cd server   # go to the server folder
$ npm i       # install packages
$ npm start   # start the server
```

## Stripe webhook
start stripe
stripe listen --forward-to localhost:5000/payments/webhook

## Authors

<p>Mesho254</p>
