
import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'

import { Subject } from 'rxjs'
import { map, filter, debounceTime, flatMap } from 'rxjs/operators'

import * as $ from 'jquery'

const authEndpoint = 'https://accounts.spotify.com/authorize'
const redirectUri = 'http://localhost:3000'
const profile = 'https://api.spotify.com/v1/me'

const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-modify-public'
];

const hash = window.location.hash.substring(1)
                                 .split('&')
                                 .reduce((initial, item) => {
                                    if(item) {
                                        var parts = item.split('=');
                                        initial[parts[0]] = decodeURIComponent(parts[1]);
                                    }

                                    return initial;
                                 }, {});

let searchBarStream = new Subject();
let spotifyRequestStream = new Subject();
let spotifyAuthStream = new Subject();
let spotifyTrackStream = new Subject();
let spotifyTrackReceiveStream = new Subject();
let spotifySongStream = new Subject();
let playlistTrackStream = new Subject();
let userInfoStream = new Subject();
let playlistInfoStream = new Subject();

class SearchBar extends React.Component {
    render() {
        return (
            <div className="content">
                <label htmlFor="search">Enter search query:</label>
                <input id="search" type="text" onChange={this.updateSearch}></input>

                <SearchResults />
            </div>
        );
    }

    updateSearch(e) {
        searchBarStream.next(e.target.value);
    }
}

class Song extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            album: props.info.album,
            title: props.info.title,
            artist: props.info.artist,
            artwork: props.info.artwork,
            id: props.info.id
        };

        if(this.props.onClick) {
            this.processSong = this.props.onClick;
            this.processSong = this.processSong.bind(this);
        }
    }

    render() {
        return (
            <div className="song" onClick={this.processSong}>
                <img src={this.state.artwork} alt={this.state.album} title={this.state.album}/>
                <div className="songInfo">
                    <p title={this.state.title}>{this.shorten(this.state.title, 30)}</p>
                    <p title={this.state.album}>{this.shorten(this.state.album, 30)}</p>
                    <p title={this.state.artist}>{this.shorten(this.state.artist, 30)}</p>
                </div>
            </div>
        )
    }

    shorten(str, len) {
        if(str.length > len) {
            return str.substring(0, len) + '...';
        }

        return str;
    }
}

class SearchResults extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            search: [],
            items: []
        }

        this.submitSongs = this.submitSongs.bind(this);
    }

    componentDidMount() {
        this.initializeTrackStream();
        this.initializeSongStream();

        spotifyRequestStream.subscribe(() => {
            console.log("removing search results");
            this.setState({
                search: []
            });
        })
    }

    render() {
        return (
            <div className="searchPage">
                <div className="results">
                    {this.state.search.map(item =>
                        <Song key={item.id} onClick={this.processSearchSong} info={item} />
                    )}
                </div>
                <div className="results">
                    {this.state.items.map(item =>
                        <Song key={item.id} onClick={this.processResultSong} info={item} />
                    )}
                </div>
                {this.displayButton()}
            </div>
        )
    }

    initializeTrackStream() {
        spotifyTrackReceiveStream.pipe(
            filter(val => !this.state.search.find(id => val.id === id))
        ).subscribe(val => {
            this.setState({
                search: this.state.search.concat(val),
            });
        });
    }

    initializeSongStream() {
        spotifySongStream.subscribe(val => {
            let search = this.state.search.slice();
            let items = this.state.items.slice();

            if(!val.arg) {
                this.setState({
                    items: items.filter(item => item.id !== val.item.id)
                })

                return null;
            }

            this.setState({
                search: search.filter(item => item.id !== val.item.id),
                items: items.concat(val.item)
            });
        });
    }

    processSearchSong() {
        spotifySongStream.next({arg: true, item: this.state});
    }

    processResultSong() {
        spotifySongStream.next({arg: false, item: this.state});
    }

    displayButton() {
        if(this.state.items.length > 0 || this.state.search.length > 0) {
            return (
                <button onClick={this.submitSongs}>Create Playlist</button>
            );
        } else return null;
    }

    submitSongs() {
        playlistTrackStream.next(this.state.items);
    }
}

class AuthButton extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            clientId: '',
        }

        this.processChange = this.processChange.bind(this);
    }

    render() {
        return (
            <div className="content">
                <div>
                    <label htmlFor="search">Client id:</label>
                    <input id="search" type="text" onChange={this.processChange}></input>
                </div>
                <a href={`${authEndpoint}?client_id=${this.state.clientId}&redirect_uri=${redirectUri}&scopes=${scopes.join('%20')}&response_type=token&show_dialog=true`}>
                    Login to Spotify
                </a>
            </div>
        )
    }

    processChange(e) {
        this.setState({clientId: e.target.value})
    }
}

class SearchApp extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            last: '',
            access: '',
        }
    }

    componentDidMount() {
        this.initializeRequestStream();
        this.initializeAuthStream();
        this.initializeSearchStream();
        this.initializeTrackStream();
        this.initializePlaylistStream();
        this.initializeUserStream();
        this.initializeInfoStream();

        if(hash.access_token) {
            spotifyAuthStream.next(hash.access_token);
        }
    }

    render() {
        return (
            <div className="main">
                <h1>Melofy 2 - Electric Boogaloo</h1>
                {this.chooseDisplay()}
            </div>
        );
    }

    chooseDisplay() {
        if (this.state.access === '') {
            return (
                <AuthButton />
            )
        } else return (
            <SearchBar />
        )
    }

    initializeRequestStream() {
        spotifyRequestStream.pipe(
            map(val => val + '&type=track&limit=10')
        ).subscribe(val => {
            $.ajax({
                url: val,
                type: "GET",
                beforeSend: (xhr) => {
                    xhr.setRequestHeader("Authorization", "Bearer " + this.state.access);
                },
                success: (data) => {
                    spotifyTrackStream.next(data);
                }
            });
        });
    }

    initializeAuthStream() {
        spotifyAuthStream.subscribe(val => {
            console.log("Received spotify auth token: " + val);
            this.setState({
                access: val,
            });
        });
    }

    initializeSearchStream() {
        searchBarStream.pipe(
            debounceTime(500),
            filter(val => val.length > 2 && val !== this.state.last),
            map(val => encodeURIComponent(val)),
            map(val => 'https://api.spotify.com/v1/search?q=' + val)
        ).subscribe(val => {
            this.setState({last: val});
            spotifyRequestStream.next(val);
        });
    }

    initializeTrackStream() {
        spotifyTrackStream.pipe(
            filter(val => val),
            flatMap(val => val.tracks.items),
            flatMap(val => {
                return val.album.images.filter(img => img.height === 64).map(img => {
                    return {title: val.name, album: val.album.name, artwork: img.url, artist: val.artists[0].name, id: val.id};
                });
            })
        ).subscribe(val => {
            spotifyTrackReceiveStream.next(val);
        });
    }

    initializePlaylistStream() {
        playlistTrackStream.pipe(
            map(val => val.map(it => 'spotify:track:' + it.id)),
            map(val => val.join(','))
        ).subscribe(val => {
            $.ajax({
                url: profile,
                type: "GET",
                beforeSend: (xhr) => {
                    xhr.setRequestHeader("Authorization", "Bearer " + this.state.access);
                },
                success: (data) => {
                    userInfoStream.next({tracks: val, id: data.id});
                }
            });
        });
    }

    initializeUserStream() {
        userInfoStream.subscribe(val => {
            $.ajax({
                url: 'https://api.spotify.com/v1/users/' + val.id + '/playlists',
                type: 'POST',
                data: '{"name":"Test playlist", "description": "no u"}',
                beforeSend: (xhr) => {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + this.state.access);
                },
                success: (data) => {
                    playlistInfoStream.next({tracks: val.tracks, id: data.id});
                }
            })
        });
    }

    initializeInfoStream() {
        playlistInfoStream.subscribe(val => {
            console.log(val.tracks);
            $.ajax({
                url: 'https://api.spotify.com/v1/playlists/' + val.id + '/tracks?uris=' + val.tracks,
                type: 'POST',
                beforeSend: (xhr) => {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + this.state.access);
                },
                success: (data) => {
                    console.log('successfully created playlist');
                }
            });
        });
    }
}

// stuff

ReactDOM.render(
    <SearchApp />,
    document.getElementById("root")
);