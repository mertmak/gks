import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom' // Yönlendiriciyi dahil ettik
// Only the Latin subsets; Turkish letters are in latin-ext.
import '@fontsource/fira-sans/latin-400.css';
import '@fontsource/fira-sans/latin-ext-400.css';
import '@fontsource/fira-sans/latin-500.css';
import '@fontsource/fira-sans/latin-ext-500.css';
import '@fontsource/fira-sans/latin-600.css';
import '@fontsource/fira-sans/latin-ext-600.css';
import '@fontsource/fira-sans/latin-700.css';
import '@fontsource/fira-sans/latin-ext-700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)