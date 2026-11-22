
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "awards": {
                  Row: {
                    "award": string,"awarded_at": string,"competition_id": string,"competition_kind": string,"id": string,"mode_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "award": string,"awarded_at"?: string,"competition_id": string,"competition_kind": string,"id"?: string,"mode_id": string,"user_id": string
                  }
                  Update: {
                    "award"?: string,"awarded_at"?: string,"competition_id"?: string,"competition_kind"?: string,"id"?: string,"mode_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "awards_mode_id_fkey"
      columns: ["mode_id"]
isOneToOne: false
      referencedRelation: "game_modes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "awards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bot_intents": {
                  Row: {
                    "chosen_option": number | null,"id": string,"materialized": boolean,"participant_id": string,"penalty_id": string,"phase": Database["public"]['Enums']["answer_phase"],"scheduled_answer_at": string | null,"will_be_correct": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chosen_option"?: number | null,"id"?: string,"materialized"?: boolean,"participant_id": string,"penalty_id": string,"phase"?: Database["public"]['Enums']["answer_phase"],"scheduled_answer_at"?: string | null,"will_be_correct"?: boolean | null
                  }
                  Update: {
                    "chosen_option"?: number | null,"id"?: string,"materialized"?: boolean,"participant_id"?: string,"penalty_id"?: string,"phase"?: Database["public"]['Enums']["answer_phase"],"scheduled_answer_at"?: string | null,"will_be_correct"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bot_intents_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bot_intents_penalty_id_fkey"
      columns: ["penalty_id"]
isOneToOne: false
      referencedRelation: "penalties"
      referencedColumns: ["id"]
    }
                  ]
                },"client_events": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"route": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"route"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"route"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"fan_counts": {
                  Row: {
                    "fans": number,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fans"?: number,"team_id": string
                  }
                  Update: {
                    "fans"?: number,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fan_counts_team_id_fkey"
      columns: ["team_id"]
isOneToOne: true
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback_reports": {
                  Row: {
                    "created_at": string,"emailed": boolean,"emailed_at": string | null,"fingerprint": string | null,"id": string,"ip_hash": string,"kind": string,"last_seen_at": string,"message": string,"meta": NonNullable<Json>,"occurrences": number,"route": string | null,"user_id": string | null,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emailed"?: boolean,"emailed_at"?: string | null,"fingerprint"?: string | null,"id"?: string,"ip_hash": string,"kind": string,"last_seen_at"?: string,"message": string,"meta"?: NonNullable<Json>,"occurrences"?: number,"route"?: string | null,"user_id"?: string | null,"username"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"emailed"?: boolean,"emailed_at"?: string | null,"fingerprint"?: string | null,"id"?: string,"ip_hash"?: string,"kind"?: string,"last_seen_at"?: string,"message"?: string,"meta"?: NonNullable<Json>,"occurrences"?: number,"route"?: string | null,"user_id"?: string | null,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"game_modes": {
                  Row: {
                    "active": boolean,"best_thirds": number,"id": string,"knockout_start": Database["public"]['Enums']["match_phase"],"lobby_seconds": number,"matchdays": number,"name": string,"qualifiers_per_zone": number,"room_size": number,"sort": number,"third_place": boolean,"tiebreak": string,"zone_size": number,"zones": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"best_thirds"?: number,"id": string,"knockout_start": Database["public"]['Enums']["match_phase"],"lobby_seconds"?: number,"matchdays": number,"name": string,"qualifiers_per_zone": number,"room_size": number,"sort"?: number,"third_place": boolean,"tiebreak": string,"zone_size": number,"zones": number
                  }
                  Update: {
                    "active"?: boolean,"best_thirds"?: number,"id"?: string,"knockout_start"?: Database["public"]['Enums']["match_phase"],"lobby_seconds"?: number,"matchdays"?: number,"name"?: string,"qualifiers_per_zone"?: number,"room_size"?: number,"sort"?: number,"third_place"?: boolean,"tiebreak"?: string,"zone_size"?: number,"zones"?: number
                  }
                  Relationships: [
                    
                  ]
                },"matches": {
                  Row: {
                    "away_participant_id": string | null,"away_score": number,"bracket_slot": number | null,"created_at": string,"group_letter": string | null,"home_participant_id": string | null,"home_score": number,"id": string,"is_bot_only": boolean,"phase": Database["public"]['Enums']["match_phase"],"status": Database["public"]['Enums']["match_status"],"tournament_id": string,"winner_participant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "away_participant_id"?: string | null,"away_score"?: number,"bracket_slot"?: number | null,"created_at"?: string,"group_letter"?: string | null,"home_participant_id"?: string | null,"home_score"?: number,"id"?: string,"is_bot_only"?: boolean,"phase": Database["public"]['Enums']["match_phase"],"status"?: Database["public"]['Enums']["match_status"],"tournament_id": string,"winner_participant_id"?: string | null
                  }
                  Update: {
                    "away_participant_id"?: string | null,"away_score"?: number,"bracket_slot"?: number | null,"created_at"?: string,"group_letter"?: string | null,"home_participant_id"?: string | null,"home_score"?: number,"id"?: string,"is_bot_only"?: boolean,"phase"?: Database["public"]['Enums']["match_phase"],"status"?: Database["public"]['Enums']["match_status"],"tournament_id"?: string,"winner_participant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_away_participant_id_fkey"
      columns: ["away_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_home_participant_id_fkey"
      columns: ["home_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_winner_participant_id_fkey"
      columns: ["winner_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    }
                  ]
                },"ops_events": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"mailed": boolean,"notified_at": string | null,"tournament_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"mailed"?: boolean,"notified_at"?: string | null,"tournament_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"mailed"?: boolean,"notified_at"?: string | null,"tournament_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"participants": {
                  Row: {
                    "abandoned": boolean,"created_at": string,"eliminated_phase": Database["public"]['Enums']["match_phase"] | null,"group_letter": string | null,"id": string,"is_bot": boolean,"placement": number | null,"seed": number | null,"team_id": string | null,"tournament_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "abandoned"?: boolean,"created_at"?: string,"eliminated_phase"?: Database["public"]['Enums']["match_phase"] | null,"group_letter"?: string | null,"id"?: string,"is_bot"?: boolean,"placement"?: number | null,"seed"?: number | null,"team_id"?: string | null,"tournament_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "abandoned"?: boolean,"created_at"?: string,"eliminated_phase"?: Database["public"]['Enums']["match_phase"] | null,"group_letter"?: string | null,"id"?: string,"is_bot"?: boolean,"placement"?: number | null,"seed"?: number | null,"team_id"?: string | null,"tournament_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "participants_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "participants_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"penalties": {
                  Row: {
                    "created_at": string,"deadline": string | null,"difficulty": Database["public"]['Enums']["difficulty"],"id": string,"idx": number,"keeper_participant_id": string,"kicker_participant_id": string,"match_id": string,"question_id": string | null,"removed_option": number | null,"removed_option_keeper": number | null,"removed_option_kicker": number | null,"resolution": Json | null,"second_chance": boolean,"started_at": string | null,"status": Database["public"]['Enums']["penalty_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deadline"?: string | null,"difficulty": Database["public"]['Enums']["difficulty"],"id"?: string,"idx": number,"keeper_participant_id": string,"kicker_participant_id": string,"match_id": string,"question_id"?: string | null,"removed_option"?: number | null,"removed_option_keeper"?: number | null,"removed_option_kicker"?: number | null,"resolution"?: Json | null,"second_chance"?: boolean,"started_at"?: string | null,"status"?: Database["public"]['Enums']["penalty_status"]
                  }
                  Update: {
                    "created_at"?: string,"deadline"?: string | null,"difficulty"?: Database["public"]['Enums']["difficulty"],"id"?: string,"idx"?: number,"keeper_participant_id"?: string,"kicker_participant_id"?: string,"match_id"?: string,"question_id"?: string | null,"removed_option"?: number | null,"removed_option_keeper"?: number | null,"removed_option_kicker"?: number | null,"resolution"?: Json | null,"second_chance"?: boolean,"started_at"?: string | null,"status"?: Database["public"]['Enums']["penalty_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "penalties_keeper_participant_id_fkey"
      columns: ["keeper_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "penalties_kicker_participant_id_fkey"
      columns: ["kicker_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "penalties_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "penalties_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"penalty_answers": {
                  Row: {
                    "id": string,"is_correct": boolean | null,"is_random": boolean,"option_index": number | null,"participant_id": string,"penalty_id": string,"phase": Database["public"]['Enums']["answer_phase"],"selected_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_correct"?: boolean | null,"is_random"?: boolean,"option_index"?: number | null,"participant_id": string,"penalty_id": string,"phase"?: Database["public"]['Enums']["answer_phase"],"selected_at"?: string | null
                  }
                  Update: {
                    "id"?: string,"is_correct"?: boolean | null,"is_random"?: boolean,"option_index"?: number | null,"participant_id"?: string,"penalty_id"?: string,"phase"?: Database["public"]['Enums']["answer_phase"],"selected_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "penalty_answers_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "penalty_answers_penalty_id_fkey"
      columns: ["penalty_id"]
isOneToOne: false
      referencedRelation: "penalties"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar": NonNullable<Json>,"created_at": string,"fav_club_id": string | null,"fav_club_mode": string,"fav_nation_id": string | null,"fav_nation_mode": string,"id": string,"qa_keep": boolean,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar"?: NonNullable<Json>,"created_at"?: string,"fav_club_id"?: string | null,"fav_club_mode"?: string,"fav_nation_id"?: string | null,"fav_nation_mode"?: string,"id": string,"qa_keep"?: boolean,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar"?: NonNullable<Json>,"created_at"?: string,"fav_club_id"?: string | null,"fav_club_mode"?: string,"fav_nation_id"?: string | null,"fav_nation_mode"?: string,"id"?: string,"qa_keep"?: boolean,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_fav_club_fk"
      columns: ["fav_club_id","fav_club_mode"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","mode_id"]
    },{
      foreignKeyName: "profiles_fav_nation_fk"
      columns: ["fav_nation_id","fav_nation_mode"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","mode_id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "category": string,"correct_index": number,"created_at": string,"difficulty": Database["public"]['Enums']["difficulty"],"id": string,"mode_id": string,"options": NonNullable<Json>,"prompt": string,"source_key": string | null,"topic": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"correct_index": number,"created_at"?: string,"difficulty": Database["public"]['Enums']["difficulty"],"id"?: string,"mode_id": string,"options": NonNullable<Json>,"prompt": string,"source_key"?: string | null,"topic"?: string | null
                  }
                  Update: {
                    "category"?: string,"correct_index"?: number,"created_at"?: string,"difficulty"?: Database["public"]['Enums']["difficulty"],"id"?: string,"mode_id"?: string,"options"?: NonNullable<Json>,"prompt"?: string,"source_key"?: string | null,"topic"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_mode_id_fkey"
      columns: ["mode_id"]
isOneToOne: false
      referencedRelation: "game_modes"
      referencedColumns: ["id"]
    }
                  ]
                },"ranked_matches": {
                  Row: {
                    "avg_rating": number,"away_participant": string,"away_rating": number,"away_result": Json | null,"away_stakes": NonNullable<Json>,"away_user": string,"created_at": string,"home_participant": string,"home_rating": number,"home_result": Json | null,"home_stakes": NonNullable<Json>,"home_user": string,"season_id": string,"settled_at": string | null,"tournament_id": string,"winner_user": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_rating": number,"away_participant": string,"away_rating": number,"away_result"?: Json | null,"away_stakes": NonNullable<Json>,"away_user": string,"created_at"?: string,"home_participant": string,"home_rating": number,"home_result"?: Json | null,"home_stakes": NonNullable<Json>,"home_user": string,"season_id": string,"settled_at"?: string | null,"tournament_id": string,"winner_user"?: string | null
                  }
                  Update: {
                    "avg_rating"?: number,"away_participant"?: string,"away_rating"?: number,"away_result"?: Json | null,"away_stakes"?: NonNullable<Json>,"away_user"?: string,"created_at"?: string,"home_participant"?: string,"home_rating"?: number,"home_result"?: Json | null,"home_stakes"?: NonNullable<Json>,"home_user"?: string,"season_id"?: string,"settled_at"?: string | null,"tournament_id"?: string,"winner_user"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranked_matches_away_participant_fkey"
      columns: ["away_participant"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_matches_away_user_fkey"
      columns: ["away_user"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_matches_home_participant_fkey"
      columns: ["home_participant"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_matches_home_user_fkey"
      columns: ["home_user"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_matches_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "ranked_seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_matches_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: true
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"ranked_players": {
                  Row: {
                    "games": number,"last_opponent": string | null,"rating": number,"season_games": number,"season_id": string,"season_peak": number,"season_wins": number,"shield": number,"updated_at": string,"user_id": string,"wins": number
                  }
                  ComputedFields: never
                  Insert: {
                    "games"?: number,"last_opponent"?: string | null,"rating"?: number,"season_games"?: number,"season_id": string,"season_peak"?: number,"season_wins"?: number,"shield"?: number,"updated_at"?: string,"user_id": string,"wins"?: number
                  }
                  Update: {
                    "games"?: number,"last_opponent"?: string | null,"rating"?: number,"season_games"?: number,"season_id"?: string,"season_peak"?: number,"season_wins"?: number,"shield"?: number,"updated_at"?: string,"user_id"?: string,"wins"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranked_players_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "ranked_seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_players_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ranked_queue": {
                  Row: {
                    "enqueued_at": string,"last_seen": string,"rating": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enqueued_at"?: string,"last_seen"?: string,"rating": number,"user_id": string
                  }
                  Update: {
                    "enqueued_at"?: string,"last_seen"?: string,"rating"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranked_queue_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ranked_season_results": {
                  Row: {
                    "final_rating": number,"games": number,"peak_rating": number,"season_id": string,"user_id": string,"wins": number
                  }
                  ComputedFields: never
                  Insert: {
                    "final_rating": number,"games": number,"peak_rating": number,"season_id": string,"user_id": string,"wins": number
                  }
                  Update: {
                    "final_rating"?: number,"games"?: number,"peak_rating"?: number,"season_id"?: string,"user_id"?: string,"wins"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ranked_season_results_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "ranked_seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ranked_season_results_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ranked_seasons": {
                  Row: {
                    "ends_at": string,"id": string,"name": string,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ends_at": string,"id": string,"name": string,"starts_at": string
                  }
                  Update: {
                    "ends_at"?: string,"id"?: string,"name"?: string,"starts_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "action": string,"count": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"count"?: number,"user_id": string,"window_start"?: string
                  }
                  Update: {
                    "action"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rooms": {
                  Row: {
                    "code": string,"created_at": string,"host_id": string | null,"id": string,"mode_id": string,"starts_at": string,"status": Database["public"]['Enums']["room_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"host_id"?: string | null,"id"?: string,"mode_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["room_status"]
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"host_id"?: string | null,"id"?: string,"mode_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["room_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_mode_id_fkey"
      columns: ["mode_id"]
isOneToOne: false
      referencedRelation: "game_modes"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "accent_color": string | null,"code": string,"created_at": string,"crest_asset": string | null,"difficulty_tier": Database["public"]['Enums']["difficulty_tier"],"flag_asset": string | null,"id": string,"kit_pattern": Database["public"]['Enums']["kit_pattern"],"kit_primary": string | null,"kit_secondary": string | null,"kit_tertiary": string | null,"mode_id": string,"name": string,"short_name": string,"strength_rank": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string | null,"code": string,"created_at"?: string,"crest_asset"?: string | null,"difficulty_tier": Database["public"]['Enums']["difficulty_tier"],"flag_asset"?: string | null,"id"?: string,"kit_pattern"?: Database["public"]['Enums']["kit_pattern"],"kit_primary"?: string | null,"kit_secondary"?: string | null,"kit_tertiary"?: string | null,"mode_id": string,"name": string,"short_name": string,"strength_rank"?: number | null
                  }
                  Update: {
                    "accent_color"?: string | null,"code"?: string,"created_at"?: string,"crest_asset"?: string | null,"difficulty_tier"?: Database["public"]['Enums']["difficulty_tier"],"flag_asset"?: string | null,"id"?: string,"kit_pattern"?: Database["public"]['Enums']["kit_pattern"],"kit_primary"?: string | null,"kit_secondary"?: string | null,"kit_tertiary"?: string | null,"mode_id"?: string,"name"?: string,"short_name"?: string,"strength_rank"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_mode_id_fkey"
      columns: ["mode_id"]
isOneToOne: false
      referencedRelation: "game_modes"
      referencedColumns: ["id"]
    }
                  ]
                },"tournament_questions": {
                  Row: {
                    "question_id": string,"taken_at": string,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "question_id": string,"taken_at"?: string,"tournament_id": string
                  }
                  Update: {
                    "question_id"?: string,"taken_at"?: string,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournament_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_questions_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"tournaments": {
                  Row: {
                    "champion_participant_id": string | null,"created_at": string,"current_phase": Database["public"]['Enums']["tournament_phase"],"groups_closed_at": string | null,"id": string,"mode_id": string,"room_id": string,"round_deadline": string | null,"seed": number,"status": Database["public"]['Enums']["tournament_status"],"third_place_participant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "champion_participant_id"?: string | null,"created_at"?: string,"current_phase"?: Database["public"]['Enums']["tournament_phase"],"groups_closed_at"?: string | null,"id"?: string,"mode_id": string,"room_id": string,"round_deadline"?: string | null,"seed": number,"status"?: Database["public"]['Enums']["tournament_status"],"third_place_participant_id"?: string | null
                  }
                  Update: {
                    "champion_participant_id"?: string | null,"created_at"?: string,"current_phase"?: Database["public"]['Enums']["tournament_phase"],"groups_closed_at"?: string | null,"id"?: string,"mode_id"?: string,"room_id"?: string,"round_deadline"?: string | null,"seed"?: number,"status"?: Database["public"]['Enums']["tournament_status"],"third_place_participant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournaments_champion_fk"
      columns: ["champion_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournaments_mode_id_fkey"
      columns: ["mode_id"]
isOneToOne: false
      referencedRelation: "game_modes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournaments_room_id_fkey"
      columns: ["room_id"]
isOneToOne: true
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournaments_third_place_fk"
      columns: ["third_place_participant_id"]
isOneToOne: false
      referencedRelation: "participants"
      referencedColumns: ["id"]
    }
                  ]
                },"user_seen_questions": {
                  Row: {
                    "question_id": string,"seen_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "question_id": string,"seen_at"?: string,"user_id": string
                  }
                  Update: {
                    "question_id"?: string,"seen_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_seen_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abandon":
{ Args: { "p_match": string }; Returns: undefined
                           },
"advance_ko_round":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"advance_tournament":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"assign_round_question":
{ Args: { "p_idx": number,"p_match": string }; Returns: string
                           },
"avatar_default":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"avatar_is_valid":
{ Args: { "p": Json }; Returns: boolean
                           },
"avatar_to_v2":
{ Args: { "p": Json }; Returns: Json
                           },
"award_tournament":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"begin_presentation":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"bot_penalty_scored":
{ Args: { "p_g_tier": Database["public"]['Enums']["difficulty_tier"],"p_k_tier": Database["public"]['Enums']["difficulty_tier"],"p_keeper": string,"p_kicker": string,"p_seedp": number }; Returns: boolean
                           },
"build_knockout":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"cleanup_stale_rooms":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"create_room":
{ Args: { "p_mode"?: string }; Returns: {
              "code": string,"room_id": string,"tournament_id": string
            }[]
                           },
"emit_score_live":
{ Args: { "p_match": string }; Returns: undefined
                           },
"enforce_rate_limit":
{ Args: { "p_action": string,"p_max": number,"p_window": string }; Returns: undefined
                           },
"engine_advance_match":
{ Args: { "p_kind": string,"p_scored": (boolean)[] }; Returns: Record<string, unknown>
                           },
"engine_bot_intent":
{ Args: { "p_seed": number,"p_tier": Database["public"]['Enums']["difficulty_tier"] }; Returns: Record<string, unknown>
                           },
"engine_fnv32":
{ Args: { "p_text": string }; Returns: number
                           },
"engine_group_standings":
{ Args: { "p_group": string,"p_tournament": string }; Returns: {
              "gd": number,"gf": number,"participant_id": string,"pts": number,"rank": number
            }[]
                           },
"engine_hash32":
{ Args: { "p_text": string }; Returns: number
                           },
"engine_imul":
{ Args: { "x": number,"y": number }; Returns: number
                           },
"engine_mulberry32":
{ Args: { "p_seed": number }; Returns: number
                           },
"engine_rand_bool":
{ Args: { "p_seed": number }; Returns: boolean
                           },
"engine_rand_int":
{ Args: { "p_n": number,"p_seed": number }; Returns: number
                           },
"engine_round_robin":
{ Args: { "p_n": number,"p_rounds": number }; Returns: {
              "away_pos": number,"home_pos": number,"md": number
            }[]
                           },
"engine_seed_order":
{ Args: { "p_n": number }; Returns: number[]
                           },
"fan_count_bump":
{ Args: { "p_delta": number,"p_team": string }; Returns: undefined
                           },
"finalize_match":
{ Args: { "p_match": string }; Returns: undefined
                           },
"game_timing":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"gen_room_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_active_match":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_active_tournament":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_bracket":
{ Args: { "p_tournament": string }; Returns: Json
                           },
"get_fan_ranking":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_match_penals":
{ Args: { "p_match": string }; Returns: Json
                           },
"get_match_scene":
{ Args: { "p_match": string }; Returns: Json
                           },
"get_penalty_result":
{ Args: { "p_penalty": string }; Returns: Json
                           },
"get_profile_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_ranked_match":
{ Args: { "p_tournament": string }; Returns: Json
                           },
"get_ranked_me":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_ranking":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"get_tournament_history":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"is_match_member":
{ Args: { "p_match": string }; Returns: boolean
                           },
"is_room_member":
{ Args: { "p_room": string }; Returns: boolean
                           },
"is_tournament_member":
{ Args: { "p_tournament": string }; Returns: boolean
                           },
"join_room":
{ Args: { "p_code": string }; Returns: {
              "code": string,"room_id": string,"tournament_id": string
            }[]
                           },
"leave_room":
{ Args: { "p_code": string }; Returns: undefined
                           },
"lobby_favorite":
{ Args: { "p_mode": string }; Returns: Json
                           },
"log_client_event":
{ Args: { "p_detail": Json,"p_kind": string,"p_route": string }; Returns: undefined
                           },
"match_penalty_difficulty":
{ Args: { "p_idx": number,"p_match": string }; Returns: Database["public"]['Enums']["difficulty"]
                           },
"materialize_bot_intents":
{ Args: { "p_force"?: boolean,"p_penalty": string }; Returns: undefined
                           },
"notify_round_next":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"open_next_round":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"open_penalty_internal":
{ Args: { "p_penalty": string }; Returns: undefined
                           },
"open_round":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"open_round_penals":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"ops_log":
{ Args: { "p_dedupe_s"?: number,"p_detail": Json,"p_kind": string,"p_tournament": string }; Returns: undefined
                           },
"ops_notify_kinds":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"ops_notify_poke":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"participant_brief":
{ Args: { "p_part": string }; Returns: Json
                           },
"precompute_bot_intents":
{ Args: { "p_penalty": string }; Returns: undefined
                           },
"progress_match":
{ Args: { "p_match": string }; Returns: string
                           },
"prune_inactive_guests":
{ Args: { "p_limit"?: number }; Returns: number
                           },
"prune_ops_tables":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"quick_play":
{ Args: { "p_mode"?: string }; Returns: {
              "code": string,"room_id": string,"tournament_id": string
            }[]
                           },
"ranked_active_tournament":
{ Args: { "p_user": string }; Returns: string
                           },
"ranked_apply_result":
{ Args: { "p_opp": number,"p_rating": number,"p_shield": number,"p_won": boolean }; Returns: {
              "delta": number,"demoted": boolean,"promoted": boolean,"rating": number,"shield": number,"shield_saved": boolean
            }[]
                           },
"ranked_cancel":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ranked_create_match":
{ Args: { "p_away": string,"p_home": string }; Returns: string
                           },
"ranked_difficulty":
{ Args: { "p_avg": number,"p_idx": number }; Returns: Database["public"]['Enums']["difficulty"]
                           },
"ranked_division":
{ Args: { "p_rating": number }; Returns: number
                           },
"ranked_division_id":
{ Args: { "p_div": number }; Returns: string
                           },
"ranked_division_min":
{ Args: { "p_div": number }; Returns: number
                           },
"ranked_enqueue":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ranked_ensure_player":
{ Args: { "p_user": string }; Returns: {
              "games": number,
"last_opponent": string | null,
"rating": number,
"season_games": number,
"season_id": string,
"season_peak": number,
"season_wins": number,
"shield": number,
"updated_at": string,
"user_id": string,
"wins": number
            }
                          SetofOptions: {
        from: "*"
        to: "ranked_players"
        isOneToOne: true
        isSetofReturn: false
      } },
"ranked_forfeit":
{ Args: { "p_match": string,"p_part": string }; Returns: undefined
                           },
"ranked_poll":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"ranked_queue_window":
{ Args: { "p_waited": number }; Returns: number
                           },
"ranked_roll_season":
{ Args: { "p_user"?: string }; Returns: string
                           },
"ranked_season_id":
{ Args: { "p_ts": string }; Returns: string
                           },
"ranked_settle":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"ranked_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"ranked_try_match":
{ Args: { "p_user": string }; Returns: string
                           },
"realtime_match_member":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"realtime_tournament_member":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"resolve_penalty":
{ Args: { "p_penalty": string }; Returns: undefined
                           },
"resolve_round":
{ Args: { "p_tournament": string }; Returns: undefined
                           },
"select_option":
{ Args: { "p_option": number,"p_penalty": string }; Returns: undefined
                           },
"set_favorites":
{ Args: { "p_club": string,"p_nation": string }; Returns: Json
                           },
"simulate_bot_match":
{ Args: { "p_match": string }; Returns: undefined
                           },
"start_tournament":
{ Args: { "p_room": string }; Returns: undefined
                           },
"submit_auto_report":
{ Args: { "p_fingerprint": string,"p_ip_hash": string,"p_message": string,"p_meta": Json,"p_route": string,"p_user": string }; Returns: {
              "id": string,"notify": boolean,"occurrences": number
            }[]
                           },
"submit_feedback":
{ Args: { "p_ip_hash": string,"p_kind": string,"p_message": string,"p_meta": Json,"p_route": string,"p_user": string,"p_username": string }; Returns: string
                           },
"take_tournament_question":
{ Args: { "p_difficulty": Database["public"]['Enums']["difficulty"],"p_seed": number,"p_tournament": string }; Returns: string
                           },
"tanda_penalty_difficulty":
{ Args: { "p_idx": number,"p_phase": Database["public"]['Enums']["match_phase"] }; Returns: Database["public"]['Enums']["difficulty"]
                           },
"tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"username_available":
{ Args: { "check_name": string }; Returns: boolean
                           }
          }
          Enums: {
            "answer_phase": "first"|"second_chance","difficulty": "easy"|"medium"|"hard"|"very_hard","difficulty_tier": "elite"|"high"|"medium"|"low","kit_pattern": "solid"|"vstripes"|"hstripes"|"sash"|"halves"|"hoops"|"band"|"chevron"|"checks","match_phase": "group"|"round_of_32"|"round_of_16"|"quarters"|"semis"|"third_place"|"final","match_status": "pending"|"in_progress"|"sudden_death"|"finished","penalty_status": "pending"|"open"|"second_chance"|"resolved","room_status": "lobby"|"starting"|"in_progress"|"finished"|"cancelled","tournament_phase": "groups"|"round_of_32"|"round_of_16"|"quarters"|"semis"|"final"|"finished","tournament_status": "pending"|"in_progress"|"finished"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "answer_phase": ["first", "second_chance"],"difficulty": ["easy", "medium", "hard", "very_hard"],"difficulty_tier": ["elite", "high", "medium", "low"],"kit_pattern": ["solid", "vstripes", "hstripes", "sash", "halves", "hoops", "band", "chevron", "checks"],"match_phase": ["group", "round_of_32", "round_of_16", "quarters", "semis", "third_place", "final"],"match_status": ["pending", "in_progress", "sudden_death", "finished"],"penalty_status": ["pending", "open", "second_chance", "resolved"],"room_status": ["lobby", "starting", "in_progress", "finished", "cancelled"],"tournament_phase": ["groups", "round_of_32", "round_of_16", "quarters", "semis", "final", "finished"],"tournament_status": ["pending", "in_progress", "finished"]
          }
        }
} as const
