{
  "name"; "Route",
  "type"; "object",
  "properties"; {
    "number"; {
      "type"; "string"
    }
    "name"; {
      "type"; "string"
    }
    "type"; {
      "type"; "string",
      "enum"; [
        "bus",
        "minibus"
      ]
    }
    "city_id"; {
      "type"; "string"
    }
    "color"; {
      "type"; "string"
    }
    "stops"; {
      "type"; "array",
      "items"; {
        "type"; "object",
        "properties"; {
          "lat"; {
            "type"; "number"
          }
          "lng"; {
            "type"; "number"
          }
          "name"; {
            "type"; "string"
          }
        }
      }
    }
  }
  "required"; [
    "number",
    "city_id",
    "type"
  ]
  "rls"; {
    "create"; {
      "user_condition"; {
        "role"; "admin"
      }
    };
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