import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {Provider} from "react-redux";
import {configureStore} from '@reduxjs/toolkit';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import products from './reducers/products.js';
import authentication from "./reducers/authentication";
import orders from "./reducers/orders";
import shipping from "./reducers/shipping";
import {
    hydratePersistedQueryCache,
    subscribePersistQueryCache,
} from "./utils/queryCachePersist";

const root = ReactDOM.createRoot(document.getElementById('root'));
const store = configureStore({
    reducer: {
        products,
        authentication,
        orders,
        shipping
    }
});

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Keep fetched data fresh for 2 minutes so page navigation is 0ms instant from cache
            staleTime: 2 * 60 * 1000,
            // Retain cached queries in memory for 30 minutes instead of discarding on unmount
            gcTime: 30 * 60 * 1000,
            refetchOnMount: true,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1
        }
    }
});

hydratePersistedQueryCache(queryClient);
subscribePersistQueryCache(queryClient);

root.render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <App/>
            </Provider>
        </QueryClientProvider>
    </React.StrictMode>
);
