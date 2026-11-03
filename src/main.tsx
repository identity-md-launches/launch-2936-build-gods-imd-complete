import { createRoot } from 'react-dom/client';
import App from './App';
import { load, start } from './sim/store';
import './styles.css';

load();
start();
createRoot(document.getElementById('root')!).render(<App />);
