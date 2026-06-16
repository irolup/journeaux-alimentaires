import DiaryPage from "./pages/DiaryPage";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <span className="brand">Journaux alimentaires</span>
      </nav>
      <main>
        <DiaryPage />
      </main>
    </div>
  );
}
