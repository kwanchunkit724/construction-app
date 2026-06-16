import { useEffect, useState } from 'react'
import { signIssuePhoto } from '../lib/issuePhotos'

// Renders an issue photo from a stored value (storage path OR a legacy full public
// URL) via a short-lived signed URL — issue-photos is a private bucket, so we never
// embed a raw public URL. Pass linkClassName to wrap the image in an <a> that opens
// the full photo in a new tab (used by IssueDetail's gallery).
export function IssuePhoto({
  stored, alt, imgClassName, linkClassName,
}: {
  stored: string
  alt?: string
  imgClassName?: string
  linkClassName?: string
}) {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    signIssuePhoto(stored).then(u => { if (active) setUrl(u) })
    return () => { active = false }
  }, [stored])

  const img = <img src={url} alt={alt ?? ''} className={imgClassName} />
  if (linkClassName == null) return img
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {img}
    </a>
  )
}
