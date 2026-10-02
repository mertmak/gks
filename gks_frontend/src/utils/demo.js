let settings = { demo: false, referenceDate: null };
export const configureDemo = value => { settings = value; };
export const demoSettings = () => settings;
