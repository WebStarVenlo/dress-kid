import { Navigate, Route, Routes } from 'react-router-dom'
import KidApp from './kid/KidApp'
import ParentApp from './parent/ParentApp'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<KidApp />} />
      <Route path="/parent/*" element={<ParentApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
