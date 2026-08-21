{
  "name"; "Review",
  "type"; "object",
  "properties"; {
    "route_id"; {
      "type"; "string"
    }
    "route_number"; {
      "type"; "string"
    }
    "driver_id"; {
      "type"; "string"
    }
    "driver_name"; {
      "type"; "string"
    }
    "vehicle_number"; {
      "type"; "string"
    }
    "cleanliness"; {
      "type"; "number"
    }
    "politeness"; {
      "type"; "number"
    }
    "punctuality"; {
      "type"; "number"
    }
    "comment"; {
      "type"; "string"
    }
    "city_id"; {
      "type"; "string"
    }
  }
  "required"; [
    "route_id"
  ]
  "rls"; {
    "create"; {}
    "read"; {}
    "update"; {
      "$or"; [
        {
          "created_by_id": "{{user.id}}"
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
          "created_by_id": "{{user.id}}"
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