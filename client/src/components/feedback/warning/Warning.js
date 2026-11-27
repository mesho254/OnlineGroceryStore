import Feedback from "../Feedback";

const Warning = ({warning, setWarning}) => {
    const style = {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.25)',
    };

    return <Feedback style={style} icon="warning" message={warning} setMessage={setWarning}/>;
};

export default Warning;
