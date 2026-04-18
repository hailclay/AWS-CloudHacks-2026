export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-dot" />
      <div className="loading-dot" style={{ animationDelay: '0.15s' }} />
      <div className="loading-dot" style={{ animationDelay: '0.3s' }} />
    </div>
  )
}
