{
  "name"; "Schedule",
  "type"; "object",
  "properties"; {
    "route_id"; {
      "type"; "string"
    }
    "route_number"; {
      "type"; "string"
    }
    "city_id"; {
      "type"; "string"
    }
    "stops_schedule"; {
      "type"; "array",
      "items"; {
        "type"; "object",
        "properties"; {
          "stop_index"; {
            "type"; "number"
          }
          "stop_name"; {
            "type"; "string"
          }
          "times"; {
            "type"; "array",
            "items"; {
              "type"; "string"
            }
          }
        }
      }
    }
  }
  "required"; [
    "route_id"
  ],
  "rls"; {
    "create"; {
      "user_condition"; {
        "role"; "admin"
      }
    }
    "read"; {}
    "update"; {
      "user_condition"; {
        "role"; "admin"
      }
    }
    "delete"; {
      "user_condition"; {
        "role"; "admin"
      }
    }
  }
}