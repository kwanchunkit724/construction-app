import { diffText, diffArrayPins } from '../../lib/diff'
import type { SIVersion } from '../../types'

export interface SiDiffCardProps {
  oldVersion: SIVersion
  newVersion: SIVersion
}

export function SiDiffCard({ oldVersion, newVersion }: SiDiffCardProps) {
  const oldP = oldVersion.payload
  const newP = newVersion.payload

  const titleChanged = oldP.title !== newP.title
  const descParts = diffText(oldP.description || '', newP.description || '')
  const descChanged = descParts.some(p => p.type !== 'equal')
  const pinDiff = diffArrayPins(oldP.drawing_version_ids || [], newP.drawing_version_ids || [])
  const pinsChanged = pinDiff.added.length > 0 || pinDiff.removed.length > 0

  const oldPhotos = (oldP.photo_paths || []).length
  const newPhotos = (newP.photo_paths || []).length
  const photosAdded = Math.max(0, newPhotos - oldPhotos)
  const photosRemoved = Math.max(0, oldPhotos - newPhotos)
  const photosChanged = photosAdded > 0 || photosRemoved > 0

  const geoChanged =
    oldP.lat !== newP.lat || oldP.lng !== newP.lng

  const anyChange =
    titleChanged || descChanged || pinsChanged || photosChanged || geoChanged

  return (
    <div className="card p-3">
      <p className="font-semibold text-site-900 mb-3">
        對比版本 v{oldVersion.version_no} → v{newVersion.version_no}
      </p>

      {!anyChange && (
        <p className="text-xs text-site-500">兩個版本內容相同。</p>
      )}

      {titleChanged && (
        <div className="mb-3">
          <p className="text-[11px] text-site-500 mb-1">標題</p>
          <div className="text-sm">
            <span className="text-site-500">舊：{oldP.title}</span>
            <span className="mx-2 text-site-400">→</span>
            <span className="font-semibold text-site-900">新：{newP.title}</span>
          </div>
        </div>
      )}

      {descChanged && (
        <div className="mb-3">
          <p className="text-[11px] text-site-500 mb-1">描述</p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {descParts.map((p, i) => {
              if (p.type === 'insert') {
                return (
                  <span key={i} className="bg-green-100 text-green-700 rounded px-0.5">
                    {p.text}
                  </span>
                )
              }
              if (p.type === 'delete') {
                return (
                  <span key={i} className="bg-red-50 text-red-600 line-through rounded px-0.5">
                    {p.text}
                  </span>
                )
              }
              return <span key={i}>{p.text}</span>
            })}
          </div>
        </div>
      )}

      {pinsChanged && (
        <div className="mb-3">
          <p className="text-[11px] text-site-500 mb-1">圖則參照</p>
          <div className="flex flex-wrap gap-1">
            {pinDiff.added.map(id => (
              <span
                key={`a-${id}`}
                className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-mono"
              >
                + {id.slice(0, 8)}
              </span>
            ))}
            {pinDiff.removed.map(id => (
              <span
                key={`r-${id}`}
                className="text-[10px] bg-red-50 text-red-600 line-through px-2 py-0.5 rounded-full font-mono"
              >
                − {id.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}

      {photosChanged && (
        <div className="mb-3">
          <p className="text-[11px] text-site-500 mb-1">相片</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {photosAdded > 0 && (
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                已加入 {photosAdded} 張
              </span>
            )}
            {photosRemoved > 0 && (
              <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                已移除 {photosRemoved} 張
              </span>
            )}
          </div>
        </div>
      )}

      {geoChanged && (
        <div className="mb-1">
          <p className="text-[11px] text-site-500 mb-1">位置</p>
          <p className="text-xs text-site-700">
            <span className="text-site-500">
              {oldP.lat != null && oldP.lng != null
                ? `舊：(${oldP.lat.toFixed(4)}, ${oldP.lng.toFixed(4)})`
                : '舊：(無)'}
            </span>
            <span className="mx-2 text-site-400">→</span>
            <span className="font-semibold">
              {newP.lat != null && newP.lng != null
                ? `新：(${newP.lat.toFixed(4)}, ${newP.lng.toFixed(4)})`
                : '新：(無)'}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

export default SiDiffCard
