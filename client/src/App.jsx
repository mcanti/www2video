import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Generator from './pages/Generator.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Generator />} />
      </Routes>
    </BrowserRouter>
  );
}
