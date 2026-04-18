from streamlit_searchbox import st_searchbox
from geopy.geocoders import Nominatim
import streamlit as st
import json, os

if "upload_mode" not in st.session_state:
    st.session_state.upload_mode = False
# 1. Setup Data
DB = "hiking.json"
if not os.path.exists(DB):
    init = {"trails": {"Sunset Peak": [], "Emerald Lake": []}, "friends": 
["Alex"]}
    with open(DB, "w") as f: json.dump(init, f)

with open(DB, "r") as f:
    data = json.load(f)

# 2. Main UI
st.title("Antsy RateMyTrails")
show_friends = st.checkbox("Only Show Friends")
# Helper for searching
def search_trails(searchterm: str):
    if not searchterm or len(searchterm) < 3: 
        return []
    
    geolocator = Nominatim(user_agent="hike_app")
    
    # We add "trail" to the search to filter for hiking spots only
    filtered_query = f"{searchterm} trail"
    
    results = geolocator.geocode(filtered_query, exactly_one=False, limit=5)
    
    # This returns only the names of the trails found
    return [(r.address, r.address) for r in results] if results else []

# The new search bar
tn = st_searchbox(search_trails, placeholder="Search for any hiking trail...")

if tn and tn not in data["trails"]:
    data["trails"][tn] = []

# --- 3. Review Form ---
with st.expander("Write a Review", expanded=st.session_state.get("upload_mode", False)):
    name = st.text_input("Name", "User1")
    score = st.slider("Rating", 1.0, 5.0, 4.0, 0.1)
    # 5-level difficulty update
    lvls = ["Beginner", "Easy", "Medium", "Hard", "Expert"]
    diff = st.select_slider("Difficulty Level", options=lvls)
    tags = st.multiselect("Tags", ["Flowers", "Views", "Wildlife"])
    note = st.text_input("Comment")
    uploaded_file = st.file_uploader("Share a photo of the trail", type=["jpg", "png", "jpeg"])
    
    if st.button("Submit"):
        import base64
        img_str = ""
        if uploaded_file is not None:
            img_str = base64.b64encode(uploaded_file.read()).decode()
            
        new = {"u": name, "s": score, "d": diff, "h": tags, "c": note, "img": img_str}
        data["trails"][tn].append(new)
        with open(DB, "w") as f: json.dump(data, f)
        st.session_state.upload_mode = False
        st.rerun()

# --- 4. Display ---
if tn and tn in data["trails"]:
    reviews = data["trails"][tn]
    st.subheader(f"Explore {tn}")

    # CRITICAL: Define col1 and col2 together here!
    col1, col2 = st.columns(2)

    with col1:
        st.write("📍 **Trail Location**")
        geolocator = Nominatim(user_agent="hike_app")
        loc = geolocator.geocode(tn)
        if loc:
            st.map({"lat": [loc.latitude], "lon": [loc.longitude]})

    with col2:
        st.write("📷 **Trail View**")
        photos = [r["img"] for r in reviews if r.get("img")]
        
        if photos:
            import base64
            st.image(base64.b64decode(photos[-1]), caption="Community Photo", use_container_width=True)
        else:
            st.info("Ooops, no photos yet. Be the first to share this trail!")
            if st.button("📤 Upload photos"):
                st.session_state.upload_mode = True
                st.rerun()

    st.divider()
    
 # --- 5. OVERALL RATING & INDIVIDUAL COMMENTS ---
    if reviews:
        avg_score = sum(r["s"] for r in reviews) / len(reviews)
        
        # Import Amatic SC from Google Fonts and Apply Orange Style
        st.markdown("""
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&display=swap');
            </style>
        """, unsafe_allow_html=True)

        st.markdown(f"""
            <div style="margin-bottom: 5px;">
                <p style="
                    font-family: 'Amatic SC', cursive; 
                    color: #FF8C00; 
                    font-size: 30px; 
                    font-weight: bold;
                    margin-bottom: 0px;
                ">
                    Overall Rating
                </p>
                <h1 style="
                    color: #FFA500; 
                    font-family: 'Amatic SC', cursive;
                    font-size: 40px; 
                    margin-top: -10px;
                ">
                    <span style="font-size: 22px;">🤍</span> {avg_score:.1f} <span style="font-size: 16px; color: gray;">/ 5.0</span>
                </h1>
            </div>
        """, unsafe_allow_html=True)
        st.divider()

        st.subheader("Reviews")
        for r in reviews:
            # Layout for each review
            st.write(f"**{r['u']}** | ⭐ {r['s']}")
            
            # Show the photo if this specific review has one
            if r.get('img'):
                import base64
                st.image(base64.b64decode(r['img']), width=250)
            
            # Show details
            st.caption(f"Difficulty: {r['d']} | Tags: {', '.join(r['h'])}")
            if r['c']: 
                st.info(r['c'])
            st.divider()
