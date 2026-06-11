{
  "name"; "City",
  "type"; "object",
  "properties"; {
    "name"; {
      "type"; "string"
    }
    "country"; {
      "type"; "string"
    }
    "lat"; {
      "type"; "number"
    }
    "lng"; {
      "type"; "number"
    }
  }
  "required" [
    "name",
    "country"
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