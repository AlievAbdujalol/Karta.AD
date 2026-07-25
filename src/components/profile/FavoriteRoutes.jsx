import { useEntityList } from '@/hooks/useEntityList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function FavoriteRoutes() {
  const { data, loading } = useEntityList('FavoriteRoute')

  if (loading) return <p className="text-sm text-muted-foreground">Загрузка...</p>
  if (!data.length) return <p className="text-sm text-muted-foreground">Нет избранных маршрутов</p>

  return (
    <div className="space-y-3 overflow-hidden">
      {data.map((item) => (
        <Card key={item.id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base truncate">
              № {item.route_number} — {item.route_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground truncate">
            {item.city_name} · {item.route_type}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
