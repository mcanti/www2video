import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './i18n/useTranslation.jsx';
import Generator from './pages/Generator.jsx';

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Generator />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
