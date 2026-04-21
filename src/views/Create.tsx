import { useParams } from 'react-router-dom'
import TemplateGallery from '../components/create/TemplateGallery'
import CreateCanvas from '../components/create/CreateCanvas'
import './Create.css'

export default function Create() {
  const { sessionId } = useParams<{ sessionId?: string }>()
  if (sessionId) return <CreateCanvas sessionId={sessionId} />
  return <TemplateGallery />
}
