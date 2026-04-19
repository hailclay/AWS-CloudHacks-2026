// Avatar helper functions
export const AVATAR_OPTIONS = [
  { id: 'avatar-1', name: 'Mascot 1', src: '/avatar-1.png' },
  { id: 'avatar-2', name: 'Mascot 2', src: '/avatar-2.png' },
  { id: 'avatar-3', name: 'Mascot 3', src: '/avatar-3.png' },
]

export function getAvatarUrl(avatarId) {
  const avatar = AVATAR_OPTIONS.find(a => a.id === avatarId)
  return avatar ? avatar.src : '/avatar-1.png' // fallback to first avatar
}

export function ProfileAvatar({ avatarId, size = 60, className = "profile-avatar" }) {
  return (
    <img
      src={getAvatarUrl(avatarId)}
      alt="Profile avatar"
      className={className}
      style={{ width: size, height: size, objectFit: 'cover' }}
    />
  )
}
