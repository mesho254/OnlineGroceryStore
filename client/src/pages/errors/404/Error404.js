import Main from "../main/Main";

const Error404 = () => {
    return (
        <Main
            code={404}
            icon="search_off"
            title="Page Not Found"
            message="We couldn't find the aisle or page you were looking for. It may have been moved, renamed, or no longer exists."
        />
    );
};

export default Error404;
