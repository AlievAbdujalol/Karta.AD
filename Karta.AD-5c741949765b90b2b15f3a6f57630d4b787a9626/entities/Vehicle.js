{
  "name"; "Vehicle",
  "type"; "object",
  "properties"; {
    "driver_id"; {
      "type"; "string"
    }
    "driver_name"; {
      "type"; "string"
    }
    "route_id"; {
      "type"; "string"
    }
    "route_number"; {
      "type"; "string"
    }
    "lat"; {
      "type"; "number"
    }
    "lng"; {
      "type"; "number"
    }
    "is_active"; {
      "type"; "boolean"
    }
    "speed"; {
      "type"; "number"
    }
    "last_updated"; {
      "type"; "string"
    }
    "vehicle_number"; {
      "type"; "string"
    }
    "type"; {
      "type"; "string",
      "enum"; [
        "bus",
        "minibus"
      ]
    }
  }
  "required"; [],
  "rls"; {
    "create"; {
      "$or"; [
        {
          "data.driver_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
    "read"; {}
    "update"; {
      "$or"; [
        {
          "data.driver_id": "{{user.id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    }
    "delete"; {
      "user_condition"; {
        "role"; "admin"
      }
    }
  }
}