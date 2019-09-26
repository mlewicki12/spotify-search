
import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'

import { Subject } from 'rxjs'
import { map, filter, debounceTime, flatMap } from 'rxjs/operators'

import * as $ from 'jquery'

const authEndpoint = 'https://accounts.spotify.com/authorize'
const redirectUri = "http://localhost:3000"

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
            uri: props.info.uri,
            album: props.info.album,
            title: props.info.title,
            artist: props.info.artist,
            artwork: props.info.artwork
        };
    }

    render() {
        return (
            <div className="song">
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
            items: [],
        }
    }

    componentDidMount() {
        this.initializeTrackStream();

        spotifyRequestStream.subscribe(() => {
            console.log("removing search results");
            this.setState({
                items: []
            });
        })
    }

    render() {
        return (
            <div className="results">
                {this.state.items.map(item =>
                    <Song key={item.uri} info={item} />
                )}
            </div>
        )
    }

    initializeTrackStream() {
        spotifyTrackReceiveStream.pipe(
            filter(val => !this.state.items.find(id => val.id === id))
        ).subscribe(val => {
            this.setState({
                items: this.state.items.concat(val),
            });
        });
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
                <a href={`${authEndpoint}?client_id=${this.state.clientId}&redirect_uri=${redirectUri}&response_type=token&show_dialog=true`}>
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
}

// stuff

ReactDOM.render(
    <SearchApp />,
    document.getElementById("root")
);