{
  "name"; "FavoriteRoute",
  "type"; "object",
  "properties"; {
    "user_id"; {
      "type"; "string"
    }
    "route_id"; {
      "type"; "string"
    }
    "route_number"; {
      "type"; "string"
    }
    "route_name"; {
      "type"; "string"
    }
    "route_type"; {
      "type"; "string"
    }
    "city_name"; {
      "type"; "string"
    }
    "route_color"; {
      "type"; "string"
    }
  }
  "required"; [
    "user_id",
    "route_id"
  ]
  "rls"; {
    "create"; {
      "$or"; [
        {
          "data.user_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
    "read"; {
      "$or"; [
        {
          "data.user_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
    "update"; {
      "$or"; [
        {
          "data.user_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
    "delete"; {
      "$or"; [
        {
          "data.user_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
  }
}