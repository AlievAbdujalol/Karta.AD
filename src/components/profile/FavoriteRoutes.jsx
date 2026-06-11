import { useEntityList } from '@/hooks/useEntityList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function FavoriteRoutes() {
  const { data, loading } = useEntityList('FavoriteRoute')

  if (loading) return <p className="text-sm text-muted-foreground">Загрузка...</p>
  if (!data.length) return <p className="text-sm text-muted-foreground">Нет избранных маршрутов</p>

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <Card key={item.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              № {item.route_number} — {item.route_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {item.city_name} · {item.route_type}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
