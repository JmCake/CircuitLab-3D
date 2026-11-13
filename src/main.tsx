import { createRoot } from 'react-dom/client';
import App from './App';
import { installDevTools } from './devTools';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found.');

installDevTools();
createRoot(root).render(<App />);
