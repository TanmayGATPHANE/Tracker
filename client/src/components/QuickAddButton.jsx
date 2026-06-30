import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function QuickAddButton() {
  const navigate = useNavigate()
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    // Only show on mobile devices
    const isMobile = window.innerWidth <= 768
    if (!isMobile) {
      setIsVisible(false)
      return
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      // Hide when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false)
      } else if (currentScrollY < lastScrollY) {
        setIsVisible(true)
      }
      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  if (!isVisible) return null

  return (
    <button
      type="button"
      className="quick-add-button"
      onClick={() => navigate('/add')}
      aria-label="Add new expense"
      title="Add new expense"
    >
      +
    </button>
  )
}